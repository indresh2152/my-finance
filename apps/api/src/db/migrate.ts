import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'migrate' });

export const runMigrations = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const { rows } = await pool.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [filename],
    );

    if (rows.length > 0) {
      logger.info({ filename }, 'migration already applied, skipping');
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    logger.info({ filename }, 'applying migration');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    logger.info({ filename }, 'migration applied');
  }
};
