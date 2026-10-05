import type { Pool } from 'pg';
import pino from 'pino';
import { errorLoggerOptions } from '../../middleware/error.middleware';
import { writeAuditLog } from '../audit-log.writer';
import type { KeyRing } from '../../utils/crypto.utils';
import { sha256Hex } from '../../utils/pkce.utils';
import { isBadDataError, pgErrorCode } from '../../utils/db.utils';
import type { EmailMeta, EmailParser, ParsedResult } from '../../parsers/email-parser';
import { getProvider, type ProviderRegistry } from './providers';
import { markReauthRequired, obtainAccess } from './mailbox-access';
import {
  ProviderNotFoundError,
  ProviderRequestError,
  ReauthRequiredError,
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

const PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED';

const MARK_FAILED_SQL = `UPDATE mail_connections SET last_sync_status = 'FAILED', last_sync_error_code = $2, updated_at = NOW()
   WHERE id = $1`;

/**
 * Recorded in the MAILBOX_SYNC audit row. Skips are broken down by reason without any email content,
 * so a bank whose emails stop parsing shows up there: no parser for the sender and subject, or the
 * parser (by key) found the email but not its fields.
 */
export interface SyncCounts {
  readonly scanned: number;
  readonly parsed: number;
  readonly skipped: number;
  readonly noParser: number;
  readonly fieldsMissing: Readonly<Record<string, number>>;
}

/** Why a message produced no record: no parser, the parser (by key) found no fields, or other. */
type Skip =
  | { readonly reason: 'noParser' | 'other' }
  | { readonly reason: 'fieldsMissing'; readonly parserKey: string };

export interface SyncParserRegistry {
  allSenders(): string[];
  allSubjectKeywords(): string[];
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
  readonly subjectKeywords: readonly string[];
  readonly searchFilterHash: string;
}

/** A parser's output together with the key of the parser that produced it (for logging). */
interface ParseOutcome {
  readonly parserKey: string;
  readonly result: ParsedResult;
}

const OTHER_SKIP: Skip = { reason: 'other' };

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
    const subjectKeywords = [...this.deps.parsers.allSubjectKeywords()].sort();
    const run: SyncRun = {
      row,
      startedAt: this.now(),
      senders,
      subjectKeywords,
      // Covers the subject filter too: narrowing or widening it needs a fresh full lookback.
      searchFilterHash: sha256Hex(
        [...senders, ...subjectKeywords.map((k) => `subject:${k}`)].join(SENDER_SEPARATOR),
      ),
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
    await db.query(MARK_SUCCEEDED_SQL, [run.row.id, run.startedAt, run.searchFilterHash]);
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
      await markReauthRequired(this.deps.db, row.id);
      return null;
    }
    const errorCode = err instanceof ProviderRequestError ? 'PROVIDER_ERROR' : 'SYNC_ERROR';
    await this.deps.db.query(MARK_FAILED_SQL, [row.id, errorCode]);
    throw err;
  }

  private async scan(run: SyncRun): Promise<SyncCounts> {
    const provider = getProvider(this.deps.providers, run.row.provider);
    const grant = await obtainAccess(this.deps, provider, run.row);
    const counts = { scanned: 0, parsed: 0, skipped: 0, noParser: 0 };
    const fieldsMissing: Record<string, number> = {};
    if (run.senders.length === 0) {
      return { ...counts, fieldsMissing };
    }

    const query = {
      senders: run.senders,
      subjectKeywords: run.subjectKeywords,
      since: this.windowStart(run),
    };
    const seen = new Set<string>();
    for await (const ref of provider.search(grant.accessToken, query)) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      counts.scanned += 1;
      const skip = await this.processMessage(provider, grant.accessToken, run.row, ref.id);
      if (skip === null) {
        counts.parsed += 1;
        continue;
      }
      counts.skipped += 1;
      if (skip.reason === 'noParser') counts.noParser += 1;
      if (skip.reason === 'fieldsMissing') {
        fieldsMissing[skip.parserKey] = (fieldsMissing[skip.parserKey] ?? 0) + 1;
      }
    }
    return { ...counts, fieldsMissing };
  }

  /** Incremental from the last sync (minus overlap), unless it never ran or the sender set changed. */
  private windowStart(run: SyncRun): Date {
    const { last_synced_at: lastSyncedAt, synced_senders_hash: previousHash } = run.row;
    // New parsers (new banks, later phases) need the full lookback, not just the incremental window.
    if (lastSyncedAt === null || previousHash !== run.searchFilterHash) {
      return new Date(run.startedAt.getTime() - INITIAL_LOOKBACK_MS);
    }
    return new Date(lastSyncedAt.getTime() - OVERLAP_MS);
  }

  /** Null when the message produced a record, otherwise why it was skipped. */
  private async processMessage(
    provider: MailProvider,
    accessToken: string,
    row: SyncRow,
    messageId: string,
  ): Promise<Skip | null> {
    const email = await this.fetchMessage(provider, accessToken, messageId);
    if (!email) return OTHER_SKIP;
    const outcome = this.parse(email);
    if ('reason' in outcome) return outcome;
    return (await this.applyOutcome(row, email.id, outcome)) ? null : OTHER_SKIP;
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

  private parse(email: ParsedEmail): ParseOutcome | Skip {
    const parser = this.deps.parsers.find({ from: email.from, subject: email.subject });
    if (!parser) return { reason: 'noParser' };
    try {
      const result = parser.parse(email);
      return result
        ? { parserKey: parser.key, result }
        : { reason: 'fieldsMissing', parserKey: parser.key };
    } catch (err) {
      logger.warn(
        { parserKey: parser.key, messageId: email.id, errName: errorName(err) },
        'parser failed; email skipped',
      );
      return OTHER_SKIP;
    }
  }
}
