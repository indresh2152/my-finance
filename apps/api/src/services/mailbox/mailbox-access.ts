import type { Pool } from 'pg';
import { AppError } from '../../middleware/error.middleware';
import { i18next } from '../../i18n';
import { decrypt, encrypt, type KeyRing } from '../../utils/crypto.utils';
import type { AccessGrant, MailProvider } from './providers/mail-provider';

const ROTATE_CREDENTIAL_SQL = `UPDATE mail_connections SET credential_enc = $2, credential_key_version = $3, updated_at = NOW()
   WHERE id = $1`;

const MARK_REAUTH_SQL = `UPDATE mail_connections
   SET status = 'REAUTH_REQUIRED', last_sync_status = 'FAILED', last_sync_error_code = 'REAUTH_REQUIRED',
       updated_at = NOW()
   WHERE id = $1`;

const HTTP_CONFLICT = 409;

/** 409 for any action that needs the mailbox's grant after it expired or was revoked. */
export const mailboxReauthRequired = (lng: string): AppError =>
  new AppError(
    'MAILBOX_REAUTH_REQUIRED',
    HTTP_CONFLICT,
    i18next.t('error.mailbox_reauth_required', { lng }),
  );

/** Parks the mailbox until the user reconnects it; the UI then shows Reconnect. */
export const markReauthRequired = async (
  db: Pick<Pool, 'query'>,
  mailboxId: string,
): Promise<void> => {
  await db.query(MARK_REAUTH_SQL, [mailboxId]);
};

export interface MailboxAccessDeps {
  readonly db: Pick<Pool, 'query'>;
  readonly keyRing: KeyRing;
}

export interface StoredCredential {
  readonly id: string;
  readonly credential_enc: Buffer;
}

/**
 * Exchanges the stored refresh token for an access token. A rotated refresh token (Microsoft
 * always rotates) is saved at once, or the next exchange would fail with invalid_grant.
 * Throws ReauthRequiredError when the grant is no longer valid.
 */
export const obtainAccess = async (
  { db, keyRing }: MailboxAccessDeps,
  provider: MailProvider,
  connection: StoredCredential,
): Promise<AccessGrant> => {
  const grant = await provider.getAccessToken(decrypt(connection.credential_enc, keyRing));
  if (grant.rotatedRefreshToken) {
    await db.query(ROTATE_CREDENTIAL_SQL, [
      connection.id,
      encrypt(grant.rotatedRefreshToken, keyRing),
      keyRing.activeVersion,
    ]);
  }
  return grant;
};
