import type PgBoss from 'pg-boss';
import type { Queryable } from '../services/audit-log.writer';
import { errorName } from '../services/mailbox/mailbox-link';
import { pgErrorCode } from '../utils/db.utils';

export const MAIL_SYNC_ALL_QUEUE = 'mail-sync-all';
export const MAIL_SYNC_MAILBOX_QUEUE = 'mail-sync-mailbox';
export const OAUTH_STATES_PURGE_QUEUE = 'oauth-states-purge';

const OAUTH_STATES_PURGE_CRON = '15 3 * * *';
const SYNC_RETRY_LIMIT = 3;
const SECONDS_PER_MINUTE = 60;
/** Base delay for exponential retry backoff; pg-boss defaults to 1 s, which retries within seconds. */
const SYNC_RETRY_DELAY_SECONDS = SECONDS_PER_MINUTE;
/** Must match RUNNING_STALE_MS in mailbox.service.ts: a RUNNING sync older than this is dead. */
const SYNC_EXPIRE_SECONDS = 30 * SECONDS_PER_MINUTE;

const ACTIVE_MAILBOX_IDS_SQL = `SELECT id FROM mail_connections WHERE status = 'ACTIVE'`;
const PURGE_EXPIRED_STATES_SQL = 'DELETE FROM oauth_states WHERE expires_at < NOW()';

export interface MailboxSyncJob {
  mailboxId: string;
}

export type JobQueue = Pick<PgBoss, 'createQueue' | 'work' | 'schedule' | 'send'>;

export interface MailboxJobDeps {
  db: Queryable;
  syncService: { syncMailbox(mailboxId: string): Promise<unknown> };
  syncCron: string;
}

/**
 * The only error a worker lets reach pg-boss, which serialises it into pgboss.job.output.
 * It carries the queue, the original error name and a SQLSTATE, never the original message,
 * detail or cause (pg errors can echo row values such as amounts or card digits).
 */
export class SyncJobError extends Error {
  constructor(
    readonly queue: string,
    readonly errName: string,
    readonly code: string | null,
  ) {
    super(`${queue} job failed: ${errName}${code ? ` (${code})` : ''}`);
    this.name = 'SyncJobError';
  }
}

/** Runs a job body; any failure is replaced by a sanitised SyncJobError so the job still fails and retries. */
const runSanitised = async (queue: string, work: () => Promise<void>): Promise<void> => {
  try {
    await work();
  } catch (err) {
    throw new SyncJobError(queue, errorName(err), pgErrorCode(err));
  }
};

/** 'stately' queue + singletonKey ⇒ at most one queued and one active sync per mailbox. */
export const enqueueMailboxSync = async (
  boss: Pick<PgBoss, 'send'>,
  mailboxId: string,
): Promise<void> => {
  const job: MailboxSyncJob = { mailboxId };
  await boss.send(MAIL_SYNC_MAILBOX_QUEUE, job, { singletonKey: mailboxId });
};

export const syncAllMailboxes = async (
  db: Queryable,
  boss: Pick<PgBoss, 'send'>,
): Promise<number> => {
  const { rows } = await db.query<{ id: string }>(ACTIVE_MAILBOX_IDS_SQL);
  for (const row of rows) {
    await enqueueMailboxSync(boss, row.id);
  }
  return rows.length;
};

export const purgeExpiredOAuthStates = async (db: Queryable): Promise<number> => {
  const { rowCount } = await db.query(PURGE_EXPIRED_STATES_SQL);
  return rowCount ?? 0;
};

/** createQueue is idempotent in pg-boss 10 (INSERT … ON CONFLICT DO NOTHING), so this runs on every start. */
const createQueues = async (boss: JobQueue): Promise<void> => {
  await boss.createQueue(MAIL_SYNC_MAILBOX_QUEUE, {
    name: MAIL_SYNC_MAILBOX_QUEUE,
    policy: 'stately',
    retryLimit: SYNC_RETRY_LIMIT,
    retryBackoff: true,
    retryDelay: SYNC_RETRY_DELAY_SECONDS,
    expireInSeconds: SYNC_EXPIRE_SECONDS,
  });
  await boss.createQueue(MAIL_SYNC_ALL_QUEUE, { name: MAIL_SYNC_ALL_QUEUE, policy: 'singleton' });
  await boss.createQueue(OAUTH_STATES_PURGE_QUEUE, {
    name: OAUTH_STATES_PURGE_QUEUE,
    policy: 'singleton',
  });
};

/** A thrown (sanitised) error fails the job, so pg-boss retries it with backoff. */
const registerWorkers = async (boss: JobQueue, deps: MailboxJobDeps): Promise<void> => {
  await boss.work<MailboxSyncJob>(MAIL_SYNC_MAILBOX_QUEUE, (jobs) =>
    runSanitised(MAIL_SYNC_MAILBOX_QUEUE, async (): Promise<void> => {
      for (const job of jobs) {
        await deps.syncService.syncMailbox(job.data.mailboxId);
      }
    }),
  );
  await boss.work(MAIL_SYNC_ALL_QUEUE, () =>
    runSanitised(MAIL_SYNC_ALL_QUEUE, async (): Promise<void> => {
      await syncAllMailboxes(deps.db, boss);
    }),
  );
  await boss.work(OAUTH_STATES_PURGE_QUEUE, () =>
    runSanitised(OAUTH_STATES_PURGE_QUEUE, async (): Promise<void> => {
      await purgeExpiredOAuthStates(deps.db);
    }),
  );
};

export const registerMailboxJobs = async (boss: JobQueue, deps: MailboxJobDeps): Promise<void> => {
  await createQueues(boss);
  await registerWorkers(boss, deps);
  await boss.schedule(MAIL_SYNC_ALL_QUEUE, deps.syncCron);
  await boss.schedule(OAUTH_STATES_PURGE_QUEUE, OAUTH_STATES_PURGE_CRON);
};
