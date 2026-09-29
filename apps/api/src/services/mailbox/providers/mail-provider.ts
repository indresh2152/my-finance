export type ProviderKey = 'GOOGLE' | 'MICROSOFT';

export const PROVIDER_KEYS: readonly ProviderKey[] = ['GOOGLE', 'MICROSOFT'];

export interface MessageRef {
  id: string;
}

export interface EmailAttachment {
  locator: string;
  filename: string;
  mimeType: string;
}

export interface ParsedEmail {
  id: string;
  from: string;
  subject: string;
  receivedAt: Date;
  text: string;
  attachments: EmailAttachment[];
}

export interface AccessGrant {
  accessToken: string;
  rotatedRefreshToken: string | null;
}

export interface AuthUrlParams {
  state: string;
  codeChallenge: string;
  loginHint: string;
  redirectUri: string;
}

export interface ExchangeCodeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface ExchangeCodeResult {
  refreshToken: string;
  accountEmail: string;
}

export interface SearchQuery {
  senders: readonly string[];
  /** Lower-case words, any of which the subject must contain; empty means no subject filter. */
  subjectKeywords: readonly string[];
  since: Date;
}

export interface MailProvider {
  readonly key: ProviderKey;
  readonly scopes: string;
  buildAuthUrl(params: AuthUrlParams): string;
  exchangeCode(params: ExchangeCodeParams): Promise<ExchangeCodeResult>;
  /** Throws ReauthRequiredError when the refresh token is no longer valid. */
  getAccessToken(refreshToken: string): Promise<AccessGrant>;
  revoke(refreshToken: string): Promise<void>;
  search(accessToken: string, query: SearchQuery): AsyncIterable<MessageRef>;
  getMessage(accessToken: string, id: string): Promise<ParsedEmail>;
  getAttachment(accessToken: string, messageId: string, locator: string): Promise<Buffer>;
}

export class ReauthRequiredError extends Error {
  constructor(public readonly provider: ProviderKey) {
    super(`${provider} grant is no longer valid`);
    this.name = 'ReauthRequiredError';
  }
}

export class ProviderRequestError extends Error {
  constructor(
    public readonly provider: ProviderKey,
    public readonly status: number,
    public readonly reason: string,
  ) {
    super(`${provider} request failed (${status}): ${reason}`);
    this.name = 'ProviderRequestError';
  }
}

export class ProviderNotFoundError extends Error {
  constructor(public readonly provider: ProviderKey) {
    super(`${provider} resource not found`);
    this.name = 'ProviderNotFoundError';
  }
}
