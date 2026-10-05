import type { Pool } from 'pg';
import type { KeyRing } from '../../utils/crypto.utils';
import type { ProviderRegistry } from './providers';
import type { ProviderKey } from './providers/mail-provider';
import type { Resolution } from './provider-resolver';
import type { PendingOAuth } from './oauth-state.service';

export type MailboxLinkErrorCode =
  | 'MAILBOX_LINK_FAILED'
  | 'MAILBOX_ACCESS_DENIED'
  | 'MAILBOX_EMAIL_MISMATCH'
  | 'MAILBOX_ADMIN_CONSENT_REQUIRED';

/** Raised during the OAuth callback; the route turns the code into a redirect query parameter. */
export class MailboxLinkError extends Error {
  constructor(public readonly code: MailboxLinkErrorCode) {
    super(code);
    this.name = 'MailboxLinkError';
  }
}

export interface RequestContext {
  readonly userId: string;
  readonly lng: string;
  readonly ip: string | null;
}

export type ResolveResult =
  | { readonly supported: true; readonly provider: ProviderKey; readonly authType: 'OAUTH' }
  | { readonly supported: false; readonly reason: 'PROVIDER_NOT_SUPPORTED' };

export type MailboxStatus = 'ACTIVE' | 'REAUTH_REQUIRED';
export type MailboxSyncStatus = 'NEVER' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface MailboxSummary {
  readonly id: string;
  readonly provider: ProviderKey;
  readonly emailMasked: string;
  readonly status: MailboxStatus;
  readonly lastSyncStatus: MailboxSyncStatus;
  readonly lastSyncErrorCode: string | null;
  readonly lastSyncedAt: string | null;
  /** When a manual sync (POST /sync) is allowed again; null when it is allowed now. */
  readonly syncAvailableAt: string | null;
  readonly createdAt: string;
}

export interface CallbackInput {
  readonly provider: ProviderKey;
  readonly code?: string;
  readonly state?: string;
  /** State echoed from the HttpOnly cookie set by /connect; binds the callback to the browser that started it. */
  readonly browserState?: string;
  readonly error?: string;
  readonly errorDescription?: string;
}

export interface LinkedMailbox {
  readonly userId: string;
  readonly mailboxId: string;
}

export interface OAuthStateStore {
  create(input: {
    userId: string;
    provider: ProviderKey;
    loginHint: string;
  }): Promise<{ state: string; codeChallenge: string }>;
  consume(state: string): Promise<PendingOAuth | null>;
}

export interface MailboxServiceDeps {
  readonly db: Pick<Pool, 'query' | 'connect'>;
  readonly providers: ProviderRegistry;
  readonly resolver: { resolve(email: string): Promise<Resolution> };
  readonly oauthStates: OAuthStateStore;
  readonly keyRing: KeyRing;
  readonly emailHmacSecret: string;
  readonly appBaseUrl: string;
  readonly enqueueSync: (mailboxId: string) => Promise<void>;
  readonly now?: () => Date;
}

export interface MailboxRow {
  readonly id: string;
  readonly provider: ProviderKey;
  readonly email_masked: string;
  readonly status: MailboxStatus;
  readonly last_sync_status: MailboxSyncStatus;
  readonly last_sync_error_code: string | null;
  readonly last_synced_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly credential_enc: Buffer;
}
