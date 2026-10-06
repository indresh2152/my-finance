import type { PoolClient } from 'pg';
import pino from 'pino';
import { AppError, errorLoggerOptions } from '../../middleware/error.middleware';
import { i18next } from '../../i18n';
import { writeAuditLog } from '../audit-log.writer';
import { requirePanProfileId } from '../pan-profile.lookup';
import { decrypt } from '../../utils/crypto.utils';
import { hashEmail, normaliseEmail } from '../../utils/email.utils';
import { getProvider } from './providers';
import { mailboxReauthRequired } from './mailbox-access';
import type { ProviderKey } from './providers/mail-provider';
import {
  MAILBOX_RESOURCE_TYPE,
  buildRedirectUri,
  completeMailboxLink,
  errorName,
  revokeQuietly,
} from './mailbox-link';
import type {
  CallbackInput,
  LinkedMailbox,
  MailboxRow,
  MailboxServiceDeps,
  MailboxSummary,
  RequestContext,
  ResolveResult,
} from './mailbox.types';

export { MailboxLinkError } from './mailbox.types';
export type {
  CallbackInput,
  LinkedMailbox,
  MailboxLinkErrorCode,
  MailboxServiceDeps,
  MailboxSummary,
  RequestContext,
  ResolveResult,
} from './mailbox.types';

const logger = pino({ ...errorLoggerOptions, name: 'mailbox-service' });

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const MINUTE_MS = 60 * 1000;
const MANUAL_SYNC_COOLDOWN_MS = 5 * MINUTE_MS;
/** Matches the pg-boss job expiry: a RUNNING status older than this is from a crashed or killed job. */
const RUNNING_STALE_MS = 30 * MINUTE_MS;

const AUDIT_SAVEPOINT = 'mailbox_unlink_audit';

const SUMMARY_COLUMNS = `id, provider, email_masked, status, last_sync_status, last_sync_error_code,
       last_synced_at, created_at, updated_at`;

const DELETE_ORPHAN_CARDS_SQL = `DELETE FROM credit_cards c
   WHERE c.pan_profile_id = $1 AND c.source = 'EMAIL'
     AND NOT EXISTS (SELECT 1 FROM card_statements s WHERE s.credit_card_id = c.id)`;

export class MailboxService {
  private readonly now: () => Date;

  constructor(private readonly deps: MailboxServiceDeps) {
    this.now = deps.now ?? ((): Date => new Date());
  }

  async resolve(ctx: RequestContext, email: string): Promise<ResolveResult> {
    await requirePanProfileId(this.deps.db, ctx.userId, ctx.lng);
    const resolution = await this.deps.resolver.resolve(email);
    // A provider without a configured OAuth client cannot be linked on this deployment.
    if (!resolution.supported || !this.deps.providers.has(resolution.provider)) {
      return { supported: false, reason: 'PROVIDER_NOT_SUPPORTED' };
    }
    await this.ensureNotActivelyLinked(ctx, email);
    return { supported: true, provider: resolution.provider, authType: 'OAUTH' };
  }

  /** Returns the state too: the route stores it in an HttpOnly cookie for the callback's browser check. */
  async startConnect(
    ctx: RequestContext,
    email: string,
  ): Promise<{ authUrl: string; state: string }> {
    const provider = await this.requireLinkableProvider(ctx, email);
    const loginHint = normaliseEmail(email);
    const { state, codeChallenge } = await this.deps.oauthStates.create({
      userId: ctx.userId,
      provider,
      loginHint,
    });
    const authUrl = getProvider(this.deps.providers, provider).buildAuthUrl({
      state,
      codeChallenge,
      loginHint,
      redirectUri: buildRedirectUri(this.deps.appBaseUrl, provider),
    });
    return { authUrl, state };
  }

  completeConnect(input: CallbackInput): Promise<LinkedMailbox> {
    return completeMailboxLink(this.deps, input);
  }

  async list(ctx: RequestContext): Promise<MailboxSummary[]> {
    await requirePanProfileId(this.deps.db, ctx.userId, ctx.lng);
    const { rows } = await this.deps.db.query<MailboxRow>(
      `SELECT ${SUMMARY_COLUMNS}
       FROM mail_connections WHERE user_id = $1 ORDER BY created_at`,
      [ctx.userId],
    );
    return rows.map((row) => this.toSummary(row));
  }

  async requestSync(ctx: RequestContext, mailboxId: string): Promise<void> {
    await requirePanProfileId(this.deps.db, ctx.userId, ctx.lng);
    const mailbox = await this.findOwned(ctx, mailboxId);

    if (mailbox.status === 'REAUTH_REQUIRED') {
      throw mailboxReauthRequired(ctx.lng);
    }
    if (this.isActivelyRunning(mailbox) || this.cooldownEndsAt(mailbox) !== null) {
      throw new AppError(
        'SYNC_TOO_FREQUENT',
        HTTP_TOO_MANY_REQUESTS,
        i18next.t('error.mailbox_sync_too_frequent', { lng: ctx.lng }),
      );
    }
    await this.deps.enqueueSync(mailbox.id);
  }

  /** Revokes the grant (best effort), then deletes the mailbox and orphaned EMAIL records atomically. */
  async unlink(ctx: RequestContext, mailboxId: string): Promise<void> {
    const panProfileId = await requirePanProfileId(this.deps.db, ctx.userId, ctx.lng);
    const mailbox = await this.findOwned(ctx, mailboxId);

    await revokeQuietly(this.deps.providers, mailbox.provider, () =>
      decrypt(mailbox.credential_enc, this.deps.keyRing),
    );
    await this.inTransaction(async (client) => {
      await this.deleteMailboxAndOrphans(client, ctx.userId, mailbox.id, panProfileId);
      await this.auditUnlink(client, ctx, mailbox);
    });
  }

  /**
   * Written in the delete's transaction, so a committed delete never returns 500 for its audit row.
   * writeAuditLog swallows its errors, but a failed INSERT still aborts the transaction; the
   * savepoint confines that, so COMMIT keeps the deletes.
   */
  private async auditUnlink(
    client: PoolClient,
    ctx: RequestContext,
    mailbox: Pick<MailboxRow, 'id' | 'provider'>,
  ): Promise<void> {
    await client.query(`SAVEPOINT ${AUDIT_SAVEPOINT}`);
    await writeAuditLog(client, {
      userId: ctx.userId,
      action: 'MAILBOX_UNLINK',
      resourceType: MAILBOX_RESOURCE_TYPE,
      resourceId: mailbox.id,
      ipAddress: ctx.ip,
      metadata: { provider: mailbox.provider },
    });
    try {
      await client.query(`RELEASE SAVEPOINT ${AUDIT_SAVEPOINT}`);
    } catch {
      // RELEASE fails only when the audit INSERT aborted the transaction.
      await client.query(`ROLLBACK TO SAVEPOINT ${AUDIT_SAVEPOINT}`);
    }
  }

  private async deleteMailboxAndOrphans(
    client: PoolClient,
    userId: string,
    mailboxId: string,
    panProfileId: string,
  ): Promise<void> {
    await client.query('DELETE FROM mail_connections WHERE id = $1 AND user_id = $2', [
      mailboxId,
      userId,
    ]);
    await client.query(DELETE_ORPHAN_CARDS_SQL, [panProfileId]);
  }

  private async inTransaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.deps.db.connect();
    try {
      await client.query('BEGIN');
      await work(client);
      await client.query('COMMIT');
    } catch (err) {
      // Isolated so a failing ROLLBACK can never mask the original error below.
      await this.safeRollback(client);
      throw err;
    } finally {
      client.release();
    }
  }

  private async safeRollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ errName: errorName(rollbackErr) }, 'mailbox unlink rollback failed');
    }
  }

  private async requireLinkableProvider(ctx: RequestContext, email: string): Promise<ProviderKey> {
    const resolved = await this.resolve(ctx, email);
    if (!resolved.supported) {
      throw new AppError(
        'PROVIDER_NOT_SUPPORTED',
        HTTP_UNPROCESSABLE,
        i18next.t('error.mailbox_provider_not_supported', { lng: ctx.lng }),
      );
    }
    return resolved.provider;
  }

  private isActivelyRunning(row: Pick<MailboxRow, 'last_sync_status' | 'updated_at'>): boolean {
    return (
      row.last_sync_status === 'RUNNING' &&
      this.now().getTime() - row.updated_at.getTime() < RUNNING_STALE_MS
    );
  }

  /** When a manual sync is allowed again, or null when it is allowed now. */
  private cooldownEndsAt(row: Pick<MailboxRow, 'last_synced_at'>): Date | null {
    if (row.last_synced_at === null) return null;
    const endsAt = new Date(row.last_synced_at.getTime() + MANUAL_SYNC_COOLDOWN_MS);
    return endsAt > this.now() ? endsAt : null;
  }

  private toSummary(row: MailboxRow): MailboxSummary {
    const staleRunning = row.last_sync_status === 'RUNNING' && !this.isActivelyRunning(row);
    return {
      id: row.id,
      provider: row.provider,
      emailMasked: row.email_masked,
      status: row.status,
      lastSyncStatus: staleRunning ? 'FAILED' : row.last_sync_status,
      lastSyncErrorCode: row.last_sync_error_code,
      lastSyncedAt: row.last_synced_at ? row.last_synced_at.toISOString() : null,
      syncAvailableAt: this.cooldownEndsAt(row)?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }

  private async ensureNotActivelyLinked(ctx: RequestContext, email: string): Promise<void> {
    const { rows } = await this.deps.db.query<{ status: string }>(
      'SELECT status FROM mail_connections WHERE user_id = $1 AND email_hash = $2',
      [ctx.userId, hashEmail(email, this.deps.emailHmacSecret)],
    );
    if (rows[0]?.status === 'ACTIVE') {
      throw new AppError(
        'MAILBOX_ALREADY_LINKED',
        HTTP_CONFLICT,
        i18next.t('error.mailbox_already_linked', { lng: ctx.lng }),
      );
    }
  }

  private async findOwned(ctx: RequestContext, mailboxId: string): Promise<MailboxRow> {
    const { rows } = await this.deps.db.query<MailboxRow>(
      `SELECT ${SUMMARY_COLUMNS}, credential_enc
       FROM mail_connections WHERE id = $1 AND user_id = $2`,
      [mailboxId, ctx.userId],
    );
    const row = rows[0];
    if (!row) {
      throw new AppError(
        'MAILBOX_NOT_FOUND',
        HTTP_NOT_FOUND,
        i18next.t('error.mailbox_not_found', { lng: ctx.lng }),
      );
    }
    return row;
  }
}
