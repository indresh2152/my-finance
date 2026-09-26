import 'dotenv/config';
import { getPool, closePool } from './db/index';
import { runMigrations } from './db/migrate';
import { seedDevData } from './db/seed';
import { initI18n } from './i18n';
import { createApp } from './app';
import { SetuPanVerifier } from './services/setu-pan.verifier';
import pino from 'pino';

const logger = pino({ name: 'server' });
const PORT = parseInt(process.env['PORT'] ?? '4000', 10);

const start = async (): Promise<void> => {
  await initI18n();

  const pool = getPool();
  await runMigrations(pool);
  await seedDevData(pool);

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
  });

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'server listening');
  });

  const shutdown = async (): Promise<void> => {
    logger.info('shutting down gracefully');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
};

start().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[server] startup failed', err);
  process.exit(1);
});
