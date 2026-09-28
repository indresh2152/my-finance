import type { Pool } from 'pg';
import pino from 'pino';
import { errorLoggerOptions } from '../../middleware/error.middleware';
import { writeAuditLog } from '../audit-log.writer';
import { decrypt, encrypt, type KeyRing } from '../../utils/crypto.utils';
import { sha256Hex } from '../../utils/pkce.utils';
import { isBadDataError, pgErrorCode } from '../../utils/db.utils';
import type { EmailMeta, EmailParser, ParsedResult } from '../../parsers/email-parser';
import { getProvider, type ProviderRegistry } from './providers';
import {
  ProviderNotFoundError,
  ProviderRequestError,
  ReauthRequiredError,
  type AccessGrant,
  type MailProvider,
  type ParsedEmail,
  type ProviderKey,
} from './providers/mail-provider';

const logger = pino({ ...errorLoggerOptions, name: 'mail-sync' });

const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_LOOKBACK_DAYS = 180;
const INITIAL_LOOKBACK_MS = INITIAL_LOOKBACK_DAYS * DAY_MS;
const OVERLAP_MS = DAY_MS;
const SENDER_SEPARATOR = ',';
const RESOURCE_TYPE = 'mail_connection';

const LOAD_CONNECTION_SQL = `SELECT mc.id, mc.user_id, mc.provider, mc.status, mc.credential_enc, mc.last_synced_at,
          mc.synced_senders_hash, pp.id AS pan_profile_id
   FROM mail_connections mc
   JOIN pan_profiles pp ON pp.user_id = mc.user_id
   WHERE mc.id = $1`;

const MARK_RUNNING_SQL = `UPDATE mail_connections SET last_sync_status = 'RUNNING', updated_at = NOW() WHERE id = $1`;

const MARK_SUCCEEDED_SQL = `UPDATE mail_connections
   SET last_sync_status = 'SUCCEEDED', last_synced_at = $2, synced_senders_hash = $3,
       last_sync_error_code = NULL, updated_at = NOW()
   WHERE id = $1`;

const MARK_REAUTH_SQL = `UPDATE mail_connections
   SET status = 'REAUTH_REQUIRED', last_sync_status = 'FAILED', last_sync_error_code = 'REAUTH_REQUIRED',
       updated_at = NOW()
   WHERE id = $1`;

const PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED';

const MARK_FAILED_SQL = `UPDATE mail_connections SET last_sync_status = 'FAILED', last_sync_error_code = $2, updated_at = NOW()
   WHERE id = $1`;

const ROTATE_CREDENTIAL_SQL = `UPDATE mail_connections SET credential_enc = $2, credential_key_version = $3, updated_at = NOW()
   WHERE id = $1`;

export interface SyncCounts {
  readonly scanned: number;
  readonly parsed: number;
  readonly skipped: number;
}

export interface SyncParserRegistry {
  allSenders(): string[];
  find(meta: EmailMeta): EmailParser | null;
}

export interface SyncRecordWriter {
  apply(
    panProfileId: string,
    mailboxId: string,
    result: ParsedResult,
    messageId: string,
  ): Promise<void>;
}

export interface MailSyncServiceDeps {
  readonly db: Pick<Pool, 'query'>;
  readonly providers: ProviderRegistry;
  readonly parsers: SyncParserRegistry;
  readonly upserts: SyncRecordWriter;
  readonly keyRing: KeyRing;
  readonly now?: () => Date;
}

interface SyncRow {
  readonly id: string;
  readonly user_id: string;
  readonly provider: ProviderKey;
  readonly status: string;
  readonly credential_enc: Buffer;
  readonly last_synced_at: Date | null;
  readonly synced_senders_hash: string | null;
  readonly pan_profile_id: string;
}

/** One sync run: the connection plus the sender set (and its hash) captured at start. */
interface SyncRun {
  readonly row: SyncRow;
  readonly startedAt: Date;
  readonly senders: readonly string[];
  readonly sendersHash: string;
}

/** A parser's output together with the key of the parser that produced it (for logging). */
interface ParseOutcome {
  readonly parserKey: string;
  readonly result: ParsedResult;
}

const errorName = (err: unknown): string => (err instanceof Error ? err.name : 'UnknownError');

export class MailSyncService {
  private readonly now: () => Date;

  constructor(private readonly deps: MailSyncServiceDeps) {
    this.now = deps.now ?? ((): Date => new Date());
  }

  /** Returns counts, or null when the mailbox was skipped or needs re-authorisation. Rethrows retryable errors. */
  async syncMailbox(mailboxId: string): Promise<SyncCounts | null> {
    const { rows } = await this.deps.db.query<SyncRow>(LOAD_CONNECTION_SQL, [mailboxId]);
    const row = rows[0];
    if (!row || row.status !== 'ACTIVE') {
      return null;
    }
    // The provider's OAuth client was removed from config: record a visible failure instead of retrying.
    if (!this.deps.providers.has(row.provider)) {
      await this.deps.db.query(MARK_FAILED_SQL, [row.id, PROVIDER_NOT_CONFIGURED]);
      return null;
    }

    const senders = [...this.deps.parsers.allSenders()].sort();
    const run: SyncRun = {
      row,
      startedAt: this.now(),
      senders,
      sendersHash: sha256Hex(senders.join(SENDER_SEPARATOR)),
    };
    await this.deps.db.query(MARK_RUNNING_SQL, [row.id]);

    try {
      const counts = await this.scan(run);
      await this.recordSuccess(run, counts);
      return counts;
    } catch (err) {
      return this.recordFailure(row, err);
    }
  }

  private async recordSuccess(run: SyncRun, counts: SyncCounts): Promise<void> {
    const { db } = this.deps;
    await db.query(MARK_SUCCEEDED_SQL, [run.row.id, run.startedAt, run.sendersHash]);
    await writeAuditLog(db, {
      userId: run.row.user_id,
      action: 'MAILBOX_SYNC',
      resourceType: RESOURCE_TYPE,
      resourceId: run.row.id,
      metadata: { provider: run.row.provider, ...counts },
    });
  }

  /** A revoked grant parks the mailbox (no retry); anything else is recorded and rethrown for pg-boss. */
  private async recordFailure(row: SyncRow, err: unknown): Promise<null> {
    if (err instanceof ReauthRequiredError) {
      await this.deps.db.query(MARK_REAUTH_SQL, [row.id]);
      return null;
    }
    const errorCode = err instanceof ProviderRequestError ? 'PROVIDER_ERROR' : 'SYNC_ERROR';
    await this.deps.db.query(MARK_FAILED_SQL, [row.id, errorCode]);
    throw err;
  }

  private async scan(run: SyncRun): Promise<SyncCounts> {
    const provider = getProvider(this.deps.providers, run.row.provider);
    const grant = await this.obtainAccess(provider, run.row);
    const counts = { scanned: 0, parsed: 0, skipped: 0 };
    if (run.senders.length === 0) {
      return counts;
    }

    const query = { senders: run.senders, since: this.windowStart(run) };
    const seen = new Set<string>();
    for await (const ref of provider.search(grant.accessToken, query)) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      counts.scanned += 1;
      const parsed = await this.processMessage(provider, grant.accessToken, run.row, ref.id);
      if (parsed) counts.parsed += 1;
      else counts.skipped += 1;
    }
    return counts;
  }

  /** Exchanges the stored refresh token, persisting a rotated one so the next run can still use it. */
  private async obtainAccess(provider: MailProvider, row: SyncRow): Promise<AccessGrant> {
    const { db, keyRing } = this.deps;
    const grant = await provider.getAccessToken(decrypt(row.credential_enc, keyRing));
    if (grant.rotatedRefreshToken) {
      await db.query(ROTATE_CREDENTIAL_SQL, [
        row.id,
        encrypt(grant.rotatedRefreshToken, keyRing),
        keyRing.activeVersion,
      ]);
    }
    return grant;
  }

  /** Incremental from the last sync (minus overlap), unless it never ran or the sender set changed. */
  private windowStart(run: SyncRun): Date {
    const { last_synced_at: lastSyncedAt, synced_senders_hash: previousHash } = run.row;
    // New parsers (new banks, later phases) need the full lookback, not just the incremental window.
    if (lastSyncedAt === null || previousHash !== run.sendersHash) {
      return new Date(run.startedAt.getTime() - INITIAL_LOOKBACK_MS);
    }
    return new Date(lastSyncedAt.getTime() - OVERLAP_MS);
  }

  /** Returns true when the message produced a record, false when it was skipped. */
  private async processMessage(
    provider: MailProvider,
    accessToken: string,
    row: SyncRow,
    messageId: string,
  ): Promise<boolean> {
    const email = await this.fetchMessage(provider, accessToken, messageId);
    const outcome = email ? this.parse(email) : null;
    if (!email || !outcome) {
      return false;
    }
    return this.applyOutcome(row, email.id, outcome);
  }

  /**
   * A record Postgres rejects as bad data (SQLSTATE class 22/23, except FK 23503) is skipped, so one
   * malformed email cannot fail every run and block the mailbox. Anything else fails the run.
   */
  private async applyOutcome(
    row: SyncRow,
    messageId: string,
    { parserKey, result }: ParseOutcome,
  ): Promise<boolean> {
    try {
      await this.deps.upserts.apply(row.pan_profile_id, row.id, result, messageId);
      return true;
    } catch (err) {
      if (!isBadDataError(err)) throw err;
      // Never log err itself: pg messages and details can echo amounts, last4 or password hints.
      logger.warn(
        { parserKey, messageId, errName: errorName(err), code: pgErrorCode(err) },
        'parsed record rejected by the database; email skipped',
      );
      return false;
    }
  }

  private async fetchMessage(
    provider: MailProvider,
    accessToken: string,
    id: string,
  ): Promise<ParsedEmail | null> {
    try {
      return await provider.getMessage(accessToken, id);
    } catch (err) {
      if (err instanceof ProviderNotFoundError) return null; // deleted between search and fetch
      throw err;
    }
  }

  private parse(email: ParsedEmail): ParseOutcome | null {
    const parser = this.deps.parsers.find({ from: email.from, subject: email.subject });
    if (!parser) return null;
    try {
      const result = parser.parse(email);
      return result ? { parserKey: parser.key, result } : null;
    } catch (err) {
      logger.warn(
        { parserKey: parser.key, messageId: email.id, errName: errorName(err) },
        'parser failed; email skipped',
      );
      return null;
    }
  }
}
