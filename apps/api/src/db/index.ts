import { Pool, types } from 'pg';

const PG_DATE_OID = 1082;

/**
 * DATE columns stay 'YYYY-MM-DD' strings. node-pg's default turns them into local-midnight Dates,
 * which serialise as the previous day in IST.
 */
types.setTypeParser(PG_DATE_OID, (value: string) => value);

let pool: Pool | null = null;

export const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
