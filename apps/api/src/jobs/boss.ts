import PgBoss from 'pg-boss';
import pino from 'pino';
import { errorLoggerOptions } from '../middleware/error.middleware';

// Redacts pg error details (which can echo row values) the same way the HTTP error logger does.
const logger = pino({ ...errorLoggerOptions, name: 'pg-boss' });

/** pg-boss keeps its tables in a dedicated schema, away from the app's migrations. */
export const PGBOSS_SCHEMA = 'pgboss';

export const createBoss = (connectionString: string): PgBoss => {
  const boss = new PgBoss({ connectionString, schema: PGBOSS_SCHEMA });
  boss.on('error', (err: Error): void => {
    logger.error({ err }, 'pg-boss error');
  });
  return boss;
};
