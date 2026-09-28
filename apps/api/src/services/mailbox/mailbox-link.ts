import pino from 'pino';
import { errorLoggerOptions } from '../../middleware/error.middleware';
import { writeAuditLog } from '../audit-log.writer';
import { encrypt } from '../../utils/crypto.utils';
import { firstRowOrThrow } from '../../utils/db.utils';
import { canonicaliseEmail, hashEmail, maskEmail } from '../../utils/email.utils';
import { getProvider, type ProviderRegistry } from './providers';
import type { ExchangeCodeResult, MailProvider, ProviderKey } from './providers/mail-provider';
import type { PendingOAuth } from './oauth-state.service';
import {
  MailboxLinkError,
  type CallbackInput,
  type LinkedMailbox,
  type MailboxLinkErrorCode,
  type MailboxServiceDeps,
} from './mailbox.types';

const logger = pino({ ...errorLoggerOptions, name: 'mailbox-link' });

const CALLBACK_PATH = '/api/v1/mailboxes/oauth/callback';
const ADMIN_CONSENT_PATTERN = /AADSTS(65001|90094|90095)/;
const ACCESS_DENIED = 'access_denied';
const CONSENT_REQUIRED = 'consent_required';
export const MAILBOX_RESOURCE_TYPE = 'mail_connection';

const UPSERT_CONNECTION_SQL = `INSERT INTO mail_connections (user_id, provider, email_hash, email_masked, credential_enc,
                                 credential_key_version, scopes)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   ON CONFLICT (user_id, email_hash) DO UPDATE SET
     provider = EXCLUDED.provider,
     credential_enc = EXCLUDED.credential_enc,
     credential_key_version = EXCLUDED.credential_key_version,
     scopes = EXCLUDED.scopes,
     status = 'ACTIVE',
     last_sync_error_code = NULL,
     updated_at = NOW()
   RETURNING id`;

export const errorName = (err: unknown): string =>
  err instanceof Error ? err.name : 'UnknownError';

export const buildRedirectUri = (appBaseUrl: string, provider: ProviderKey): string =>
  `${appBaseUrl}${CALLBACK_PATH}/${provider.toLowerCase()}`;

/** Best-effort grant revocation: a failure is logged (provider key and error name only) and ignored. */
export const revokeQuietly = async (
  registry: ProviderRegistry,
  provider: ProviderKey,
  readToken: () => string,
): Promise<void> => {
  try {
    await getProvider(registry, provider).revoke(readToken());
  } catch (err) {
    logger.warn({ provider, errName: errorName(err) }, 'provider revoke failed; continuing');
  }
};

const mapProviderError = (error: string, description = ''): MailboxLinkErrorCode => {
  if (error === CONSENT_REQUIRED || ADMIN_CONSENT_PATTERN.test(description)) {
    return 'MAILBOX_ADMIN_CONSENT_REQUIRED';
  }
  return error === ACCESS_DENIED ? 'MAILBOX_ACCESS_DENIED' : 'MAILBOX_LINK_FAILED';
};

/** Validates the callback and consumes its single-use state; returns the pending flow and code. */
const consumeCallback = async (
  deps: MailboxServiceDeps,
  input: CallbackInput,
): Promise<{ pending: PendingOAuth; code: string }> => {
  // RFC 6749 §10.12: the state must come back to the same browser that started the flow.
  // Checked before consuming so a forged callback cannot burn the legitimate user's state.
  if (!input.state || input.browserState !== input.state) {
    throw new MailboxLinkError('MAILBOX_LINK_FAILED');
  }
  const pending = await deps.oauthStates.consume(input.state);
  if (!pending || pending.provider !== input.provider) {
    throw new MailboxLinkError('MAILBOX_LINK_FAILED');
  }
  if (input.error) {
    throw new MailboxLinkError(mapProviderError(input.error, input.errorDescription));
  }
  if (!input.code) {
    throw new MailboxLinkError('MAILBOX_LINK_FAILED');
  }
  return { pending, code: input.code };
};

const exchangeCode = async (
  deps: MailboxServiceDeps,
  provider: MailProvider,
  pending: PendingOAuth,
  code: string,
): Promise<ExchangeCodeResult> => {
  try {
    return await provider.exchangeCode({
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: buildRedirectUri(deps.appBaseUrl, pending.provider),
    });
  } catch (err) {
    logger.warn(
      { provider: pending.provider, errName: errorName(err) },
      'authorisation code exchange failed',
    );
    throw new MailboxLinkError('MAILBOX_LINK_FAILED');
  }
};

/** The signed-in account must be the mailbox the user typed; otherwise the new grant is revoked. */
const ensureAccountMatches = async (
  deps: MailboxServiceDeps,
  pending: PendingOAuth,
  exchange: ExchangeCodeResult,
): Promise<void> => {
  if (canonicaliseEmail(exchange.accountEmail) === canonicaliseEmail(pending.loginHint)) {
    return;
  }
  await revokeQuietly(deps.providers, pending.provider, () => exchange.refreshToken);
  throw new MailboxLinkError('MAILBOX_EMAIL_MISMATCH');
};

const persistConnection = async (
  deps: MailboxServiceDeps,
  provider: MailProvider,
  pending: PendingOAuth,
  refreshToken: string,
): Promise<string> => {
  const { rows } = await deps.db.query<{ id: string }>(UPSERT_CONNECTION_SQL, [
    pending.userId,
    pending.provider,
    hashEmail(pending.loginHint, deps.emailHmacSecret),
    maskEmail(pending.loginHint),
    encrypt(refreshToken, deps.keyRing),
    deps.keyRing.activeVersion,
    provider.scopes,
  ]);
  return firstRowOrThrow(rows, 'mail_connections upsert').id;
};

/** A grant that could not be stored is orphaned at the provider, so it is revoked before failing. */
const persistOrRevoke = async (
  deps: MailboxServiceDeps,
  provider: MailProvider,
  pending: PendingOAuth,
  refreshToken: string,
): Promise<string> => {
  try {
    return await persistConnection(deps, provider, pending, refreshToken);
  } catch (err) {
    await revokeQuietly(deps.providers, pending.provider, () => refreshToken);
    throw err;
  }
};

const queueFirstSync = async (deps: MailboxServiceDeps, mailboxId: string): Promise<void> => {
  try {
    await deps.enqueueSync(mailboxId);
  } catch (err) {
    // The scheduled sync will pick the mailbox up; linking itself succeeded.
    logger.warn({ mailboxId, errName: errorName(err) }, 'initial sync could not be queued');
  }
};

/** Completes the OAuth callback: verifies state, exchanges the code, stores the encrypted grant. */
export const completeMailboxLink = async (
  deps: MailboxServiceDeps,
  input: CallbackInput,
): Promise<LinkedMailbox> => {
  const { pending, code } = await consumeCallback(deps, input);
  const provider = getProvider(deps.providers, pending.provider);
  const exchange = await exchangeCode(deps, provider, pending, code);
  await ensureAccountMatches(deps, pending, exchange);

  const mailboxId = await persistOrRevoke(deps, provider, pending, exchange.refreshToken);
  await queueFirstSync(deps, mailboxId);
  await writeAuditLog(deps.db, {
    userId: pending.userId,
    action: 'MAILBOX_LINK',
    resourceType: MAILBOX_RESOURCE_TYPE,
    resourceId: mailboxId,
    ipAddress: null, // the OAuth redirect is not tied to the IP that started the flow
    metadata: { provider: pending.provider },
  });
  return { userId: pending.userId, mailboxId };
};
