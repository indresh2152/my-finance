import 'dotenv/config';
import type { Server } from 'http';
import type { Pool } from 'pg';
import type PgBoss from 'pg-boss';
import { getPool, closePool } from './db/index';
import { runMigrations } from './db/migrate';
import { seedDevData } from './db/seed';
import { initI18n } from './i18n';
import { createApp } from './app';
import { SetuPanVerifier } from './services/setu-pan.verifier';
import { loadMailboxConfig } from './config/mailbox.config';
import { createBoss } from './jobs/boss';
import { createMailboxModule } from './services/mailbox/mailbox.module';
import { errorName } from './services/mailbox/mailbox-link';
import type { MailboxModule } from './routes/mailboxes.routes';
import pino from 'pino';

const logger = pino({ name: 'server' });
const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
const BOSS_STOP_TIMEOUT_MS = 20_000;

interface MailboxRuntime {
  boss: PgBoss;
  module: MailboxModule;
}

/** Starts pg-boss and the mailbox feature only when MAILBOX_ENABLED=true; invalid config throws. */
const startMailbox = async (pool: Pool): Promise<MailboxRuntime | null> => {
  const config = loadMailboxConfig(process.env);
  if (!config) return null;

  // Same database as the app pool; pg-boss keeps its tables in its own schema.
  const boss = createBoss(process.env['DATABASE_URL'] ?? '');
  await boss.start();
  const module = await createMailboxModule({ db: pool, config, boss });
  logger.info('mailbox integration enabled');
  return { boss, module };
};

/** Stops pg-boss (letting running jobs finish) first, then the pool it shares a database with. */
const releaseResources = async (boss: PgBoss | null): Promise<void> => {
  try {
    await boss?.stop({ graceful: true, wait: true, timeout: BOSS_STOP_TIMEOUT_MS });
  } catch (err) {
    logger.error({ errName: errorName(err) }, 'pg-boss stop failed');
  }
  try {
    await closePool();
  } catch (err) {
    logger.error({ errName: errorName(err) }, 'pool close failed');
  } finally {
    process.exit(0);
  }
};

/** A second SIGTERM/SIGINT while shutting down is ignored, so cleanup runs exactly once. */
const registerShutdown = (server: Server, boss: PgBoss | null): void => {
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down gracefully');
    server.close(() => {
      void releaseResources(boss);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

const start = async (): Promise<void> => {
  await initI18n();

  const pool = getPool();
  await runMigrations(pool);
  await seedDevData(pool);
  const mailbox = await startMailbox(pool);

  const panVerifier = new SetuPanVerifier(
    process.env['SETU_BASE_URL'] ?? 'https://dg-sandbox.setu.co',
    process.env['SETU_CLIENT_ID'] ?? '',
    process.env['SETU_CLIENT_SECRET'] ?? '',
    process.env['SETU_PRODUCT_INSTANCE_ID'] ?? '',
  );

  const app = createApp({
    db: pool,
    jwtSecret: process.env['JWT_SECRET'] ?? '',
    refreshTokenSecret: process.env['REFRESH_TOKEN_SECRET'] ?? '',
    panHmacSecret: process.env['PAN_HMAC_SECRET'] ?? '',
    panVerifier,
    mailbox: mailbox?.module,
  });

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'server listening');
  });
  registerShutdown(server, mailbox?.boss ?? null);
};

start().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[server] startup failed', err);
  process.exit(1);
});
