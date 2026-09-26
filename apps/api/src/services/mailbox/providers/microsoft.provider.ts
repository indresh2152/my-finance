import { htmlToText } from '../../../utils/html-to-text';
import { matchesSender } from '../../../parsers/sender-match';
import { getJson, postTokenForm } from './provider-http';
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

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES =
  'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read';
const PAGE_SIZE = 100;
const HTTP_BAD_REQUEST = 400;
const TEXT_BODY_PREFERENCE = 'outlook.body-content-type="text"';
const DEFAULT_MIME_TYPE = 'application/octet-stream';
const HTML_CONTENT_TYPE = 'html';

interface GraphAddress {
  emailAddress?: { address?: string };
}

interface GraphMessageMeta {
  id: string;
  from?: GraphAddress;
}

interface GraphListResponse {
  value: GraphMessageMeta[];
  '@odata.nextLink'?: string;
}

interface GraphAttachmentMeta {
  id: string;
  name: string;
  contentType?: string;
}

interface GraphMessage {
  id: string;
  subject?: string;
  receivedDateTime: string;
  from?: GraphAddress;
  body?: { contentType?: string; content?: string };
  attachments?: GraphAttachmentMeta[];
}

const toEmailAttachment = (attachment: GraphAttachmentMeta): EmailAttachment => ({
  locator: attachment.id,
  filename: attachment.name,
  mimeType: attachment.contentType ?? DEFAULT_MIME_TYPE,
});

export class MicrosoftMailProvider implements MailProvider {
  readonly key = 'MICROSOFT' as const;
  readonly scopes = SCOPES;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  buildAuthUrl({ state, codeChallenge, loginHint, redirectUri }: AuthUrlParams): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      state,
      login_hint: loginHint,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${AUTHORITY}/authorize?${params.toString()}`;
  }

  async exchangeCode({
    code,
    codeVerifier,
    redirectUri,
  }: ExchangeCodeParams): Promise<ExchangeCodeResult> {
    const token = await postTokenForm(this.key, `${AUTHORITY}/token`, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      scope: SCOPES,
    });
    if (!token.refresh_token) {
      throw new ProviderRequestError(this.key, HTTP_BAD_REQUEST, 'missing_refresh_token');
    }
    const me = await getJson<{ mail: string | null; userPrincipalName: string }>(
      this.key,
      `${GRAPH}/me?$select=mail,userPrincipalName`,
      token.access_token,
    );
    return { refreshToken: token.refresh_token, accountEmail: me.mail ?? me.userPrincipalName };
  }

  async getAccessToken(refreshToken: string): Promise<AccessGrant> {
    const token = await postTokenForm(this.key, `${AUTHORITY}/token`, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    });
    return { accessToken: token.access_token, rotatedRefreshToken: token.refresh_token ?? null };
  }

  /**
   * Microsoft has no per-app refresh-token revoke for delegated consent. Unlink deletes our
   * stored token locally; the UI tells the user where to remove the app's consent in their
   * Microsoft account. This method exists only to satisfy the MailProvider contract.
   */
  revoke(_refreshToken: string): Promise<void> {
    return Promise.resolve();
  }

  async *search(accessToken: string, { senders, since }: SearchQuery): AsyncIterable<MessageRef> {
    // Graph rejects combined from/date filters as inefficient, so senders are matched locally.
    const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
    let url: string | undefined =
      `${GRAPH}/me/messages?$filter=${filter}&$select=id,from,receivedDateTime&$top=${PAGE_SIZE}`;
    while (url) {
      const requestedUrl = url;
      const page: GraphListResponse = await getJson<GraphListResponse>(
        this.key,
        requestedUrl,
        accessToken,
      );
      for (const message of page.value) {
        const address = message.from?.emailAddress?.address;
        if (address && matchesSender(address, senders)) {
          yield { id: message.id };
        }
      }
      // Guard against a buggy API response repeating the same link forever.
      if (page['@odata.nextLink'] && page['@odata.nextLink'] === requestedUrl) {
        break;
      }
      url = page['@odata.nextLink'];
    }
  }

  async getMessage(accessToken: string, id: string): Promise<ParsedEmail> {
    const message = await getJson<GraphMessage>(
      this.key,
      `${GRAPH}/me/messages/${encodeURIComponent(id)}?$select=from,subject,receivedDateTime,body&$expand=attachments($select=id,name,contentType)`,
      accessToken,
      { Prefer: TEXT_BODY_PREFERENCE },
    );
    const content = message.body?.content ?? '';
    return {
      id: message.id,
      from: (message.from?.emailAddress?.address ?? '').toLowerCase(),
      subject: message.subject ?? '',
      receivedAt: new Date(message.receivedDateTime),
      text: message.body?.contentType === HTML_CONTENT_TYPE ? htmlToText(content) : content.trim(),
      attachments: (message.attachments ?? []).map(toEmailAttachment),
    };
  }

  async getAttachment(accessToken: string, messageId: string, locator: string): Promise<Buffer> {
    const attachment = await getJson<{ contentBytes?: string }>(
      this.key,
      `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(locator)}`,
      accessToken,
    );
    if (!attachment.contentBytes) {
      throw new ProviderNotFoundError(this.key);
    }
    return Buffer.from(attachment.contentBytes, 'base64');
  }
}
