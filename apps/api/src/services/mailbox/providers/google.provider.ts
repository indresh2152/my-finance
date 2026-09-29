import { htmlToText } from '../../../utils/html-to-text';
import { extractAddress } from '../../../parsers/sender-match';
import { FORM_CONTENT_TYPE, getJson, postTokenForm } from './provider-http';
import {
  ProviderNotFoundError,
  ProviderRequestError,
  type AccessGrant,
  type AuthUrlParams,
  type EmailAttachment,
  type ExchangeCodeParams,
  type ExchangeCodeResult,
  type MailProvider,
  type MessageRef,
  type ParsedEmail,
  type SearchQuery,
} from './mail-provider';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const SENDERS_PER_QUERY = 20;
const PAGE_SIZE = '100';
const MS_PER_SECOND = 1000;
const HTTP_BAD_REQUEST = 400;
const DOMAIN_PREFIX = '@';
const DEFAULT_MIME_TYPE = 'application/octet-stream';

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailAttachmentPart extends GmailPart {
  filename: string;
  partId: string;
}

interface GmailMessage {
  id: string;
  internalDate: string;
  payload: GmailPart;
}

interface GmailListResponse {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
}

const flattenParts = (part: GmailPart): GmailPart[] => [
  part,
  ...(part.parts ?? []).flatMap(flattenParts),
];

const decodeBody = (data: string): string => Buffer.from(data, 'base64url').toString('utf8');

const findBodyPart = (parts: readonly GmailPart[], mimeType: string): GmailPart | undefined =>
  parts.find((part) => part.mimeType === mimeType && !part.filename && part.body?.data);

const isAttachmentPart = (part: GmailPart): part is GmailAttachmentPart =>
  Boolean(part.filename) && part.partId !== undefined;

export class GoogleMailProvider implements MailProvider {
  readonly key = 'GOOGLE' as const;
  readonly scopes = GMAIL_SCOPE;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  buildAuthUrl({ state, codeChallenge, loginHint, redirectUri }: AuthUrlParams): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      login_hint: loginHint,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode({
    code,
    codeVerifier,
    redirectUri,
  }: ExchangeCodeParams): Promise<ExchangeCodeResult> {
    const token = await postTokenForm(this.key, TOKEN_URL, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });
    if (!token.refresh_token) {
      throw new ProviderRequestError(this.key, HTTP_BAD_REQUEST, 'missing_refresh_token');
    }
    const profile = await getJson<{ emailAddress: string }>(
      this.key,
      `${GMAIL_API}/profile`,
      token.access_token,
    );
    return { refreshToken: token.refresh_token, accountEmail: profile.emailAddress };
  }

  async getAccessToken(refreshToken: string): Promise<AccessGrant> {
    const token = await postTokenForm(this.key, TOKEN_URL, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return { accessToken: token.access_token, rotatedRefreshToken: token.refresh_token ?? null };
  }

  async revoke(refreshToken: string): Promise<void> {
    const response = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': FORM_CONTENT_TYPE },
      body: new URLSearchParams({ token: refreshToken }),
    });
    // 400 means the token is already invalid — nothing left to revoke.
    if (!response.ok && response.status !== HTTP_BAD_REQUEST) {
      throw new ProviderRequestError(this.key, response.status, 'revoke_failed');
    }
  }

  async *search(
    accessToken: string,
    { senders, subjectKeywords, since }: SearchQuery,
  ): AsyncIterable<MessageRef> {
    const afterSeconds = Math.floor(since.getTime() / MS_PER_SECOND);
    const subjectTerm =
      subjectKeywords.length > 0 ? ` subject:(${subjectKeywords.join(' OR ')})` : '';
    for (let start = 0; start < senders.length; start += SENDERS_PER_QUERY) {
      const terms = senders
        .slice(start, start + SENDERS_PER_QUERY)
        .map((sender) => (sender.startsWith(DOMAIN_PREFIX) ? sender.slice(1) : sender));
      const query = `from:(${terms.join(' OR ')})${subjectTerm} after:${afterSeconds}`;
      yield* this.searchPages(accessToken, query);
    }
  }

  async getMessage(accessToken: string, id: string): Promise<ParsedEmail> {
    const message = await this.fetchFullMessage(accessToken, id);
    const headers = message.payload.headers ?? [];
    const header = (name: string): string =>
      headers.find((h) => h.name.toLowerCase() === name)?.value ?? '';
    const parts = flattenParts(message.payload);
    const plain = findBodyPart(parts, 'text/plain');
    const html = findBodyPart(parts, 'text/html');
    const text = plain?.body?.data
      ? decodeBody(plain.body.data)
      : html?.body?.data
        ? htmlToText(decodeBody(html.body.data))
        : '';
    const attachments: EmailAttachment[] = parts.filter(isAttachmentPart).map((part) => ({
      locator: part.partId,
      filename: part.filename,
      mimeType: part.mimeType ?? DEFAULT_MIME_TYPE,
    }));

    return {
      id: message.id,
      from: header('from') ? extractAddress(header('from')) : '',
      subject: header('subject'),
      receivedAt: new Date(Number(message.internalDate)),
      text,
      attachments,
    };
  }

  async getAttachment(accessToken: string, messageId: string, locator: string): Promise<Buffer> {
    // Gmail attachment ids are not stable across fetches: always re-resolve from the MIME part id.
    const message = await this.fetchFullMessage(accessToken, messageId);
    const part = flattenParts(message.payload).find((p) => p.partId === locator);
    if (part?.body?.data) {
      return Buffer.from(part.body.data, 'base64url');
    }
    if (!part?.body?.attachmentId) {
      throw new ProviderNotFoundError(this.key);
    }
    const attachment = await getJson<{ data: string }>(
      this.key,
      `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
      accessToken,
    );
    return Buffer.from(attachment.data, 'base64url');
  }

  private async *searchPages(accessToken: string, query: string): AsyncIterable<MessageRef> {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q: query, maxResults: PAGE_SIZE });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await getJson<GmailListResponse>(
        this.key,
        `${GMAIL_API}/messages?${params.toString()}`,
        accessToken,
      );
      for (const message of page.messages ?? []) {
        yield { id: message.id };
      }
      // Guard against a buggy API response repeating the same token forever.
      if (page.nextPageToken && page.nextPageToken === pageToken) {
        break;
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  private fetchFullMessage(accessToken: string, id: string): Promise<GmailMessage> {
    return getJson<GmailMessage>(
      this.key,
      `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`,
      accessToken,
    );
  }
}
