import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'seed' });

const SEED_USERNAME = 'devuser';
const SEED_EMAIL = 'dev@example.com';
const SEED_PASSWORD = 'devpass123';

export const seedDevData = async (pool: Pool): Promise<void> => {
  if (process.env['NODE_ENV'] === 'production') {
    return;
  }

  const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
  if (rows.length > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [SEED_USERNAME, SEED_EMAIL, passwordHash],
  );

  logger.info({ username: SEED_USERNAME }, 'dev seed user created');
};
