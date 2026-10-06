import fs from 'fs';
import path from 'path';
import { Pool, type QueryResult } from 'pg';
import { firstRowOrThrow } from '../../utils/db.utils';

// Runs only when TEST_DATABASE_URL is exported (CI / explicit local run). The database is wiped.
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;
const MIGRATION_SQL = fs.readFileSync(path.join(__dirname, '001_initial_schema.sql'), 'utf8');

describeWithDb('001_initial_schema', () => {
  let pool: Pool;
  let userId: string;
  let panProfileId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query(MIGRATION_SQL);
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (username, email, password_hash) VALUES ('mig_user', 'mig@example.com', 'x') RETURNING id`,
    );
    userId = firstRowOrThrow(user.rows, 'insert users').id;
    const pan = await pool.query<{ id: string }>(
      `INSERT INTO pan_profiles (user_id, pan_hash, pan_masked) VALUES ($1, 'hash', 'ABCDE####F') RETURNING id`,
      [userId],
    );
    panProfileId = firstRowOrThrow(pan.rows, 'insert pan_profiles').id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should be idempotent when applied a second time', async () => {
    await expect(pool.query(MIGRATION_SQL)).resolves.toBeDefined();
  });

  it('should reject a USER credit card without identity fields', async () => {
    await expect(
      pool.query(
        `INSERT INTO credit_cards (pan_profile_id, source, card_number_last4, issuing_bank)
         VALUES ($1, 'USER', '1111', 'HDFC')`,
        [panProfileId],
      ),
    ).rejects.toThrow(/credit_cards_user_fields_required/);
  });

  it('should accept an EMAIL credit card with only bank and last4', async () => {
    await expect(
      pool.query(
        `INSERT INTO credit_cards (pan_profile_id, source, card_number_last4, issuing_bank, card_variant)
         VALUES ($1, 'EMAIL', '2222', 'HDFC', 'OTHER')`,
        [panProfileId],
      ),
    ).resolves.toBeDefined();
  });

  it('should reject a duplicate EMAIL card for the same bank and last4', async () => {
    await expect(
      pool.query(
        `INSERT INTO credit_cards (pan_profile_id, source, card_number_last4, issuing_bank, card_variant)
         VALUES ($1, 'EMAIL', '2222', 'HDFC', 'OTHER')`,
        [panProfileId],
      ),
    ).rejects.toThrow(/uq_credit_cards_email/);
  });

  it('should treat a named card with digits as the same card as its digits alone', async () => {
    await expect(
      pool.query(
        `INSERT INTO credit_cards (pan_profile_id, source, card_number_last4, card_name, issuing_bank)
         VALUES ($1, 'EMAIL', '2222', 'Regalia', 'HDFC')`,
        [panProfileId],
      ),
    ).rejects.toThrow(/uq_credit_cards_email/);
  });

  it('should accept two EMAIL cards known only by the same name, told apart by cycle day', async () => {
    const insert = `INSERT INTO credit_cards (pan_profile_id, source, card_name, issuing_bank, billing_cycle_day)
                    VALUES ($1, 'EMAIL', 'Scapia', 'FEDERAL', $2)`;
    await expect(pool.query(insert, [panProfileId, 14])).resolves.toBeDefined();
    await expect(pool.query(insert, [panProfileId, 25])).resolves.toBeDefined();
  });

  it('should reject an EMAIL card with neither digits nor a name', async () => {
    await expect(
      pool.query(
        `INSERT INTO credit_cards (pan_profile_id, source, issuing_bank) VALUES ($1, 'EMAIL', 'AXIS')`,
        [panProfileId],
      ),
    ).rejects.toThrow(/credit_cards_identity_required/);
  });

  it('should reject a USER card without digits', async () => {
    await expect(
      pool.query(
        `INSERT INTO credit_cards (pan_profile_id, source, card_number_hash, card_network, issuing_bank,
                                   expiry_month, expiry_year, name_on_card)
         VALUES ($1, 'USER', 'no-digits-hash', 'VISA', 'HDFC', 12, 2030, 'Test User')`,
        [panProfileId],
      ),
    ).rejects.toThrow(/credit_cards_identity_required/);
  });

  it('should allow a USER card and an EMAIL card with the same bank and last4', async () => {
    await expect(
      pool.query(
        `INSERT INTO credit_cards (pan_profile_id, source, card_number_hash, card_number_last4, card_network,
                                   issuing_bank, expiry_month, expiry_year, name_on_card)
         VALUES ($1, 'USER', 'card-hash', '2222', 'VISA', 'HDFC', 12, 2030, 'Test User')`,
        [panProfileId],
      ),
    ).resolves.toBeDefined();
  });

  it('should reject linking the same mailbox twice for one user', async () => {
    const insert = `INSERT INTO mail_connections (user_id, provider, email_hash, email_masked, credential_enc,
                                                   credential_key_version, scopes)
                    VALUES ($1, 'GOOGLE', 'email-hash', 'te****@gmail.com', '\\x00', 1, 'scope')`;
    await pool.query(insert, [userId]);
    await expect(pool.query(insert, [userId])).rejects.toThrow(/uq_mail_connections_user_email/);
  });

  it('should cascade statements when a mailbox is deleted', async () => {
    const mailbox = await pool.query<{ id: string }>(
      `SELECT id FROM mail_connections WHERE user_id = $1`,
      [userId],
    );
    const card = await pool.query<{ id: string }>(
      `SELECT id FROM credit_cards WHERE source = 'EMAIL' AND card_number_last4 = '2222'`,
    );
    const mailboxId = firstRowOrThrow(mailbox.rows, 'select mail_connections').id;
    const cardId = firstRowOrThrow(card.rows, 'select credit_cards').id;
    await pool.query(
      `INSERT INTO card_statements (credit_card_id, mail_connection_id, statement_date, due_date,
                                    total_amount_due, source_message_id)
       VALUES ($1, $2, '2026-09-05', '2026-09-25', 1000, 'msg-1')`,
      [cardId, mailboxId],
    );
    const insertWithoutDueDate = (statementDate: string, total: number): Promise<QueryResult> =>
      pool.query(
        `INSERT INTO card_statements (credit_card_id, mail_connection_id, statement_date, due_date,
                                      total_amount_due, source_message_id)
         VALUES ($1, $2, $3, NULL, $4, 'msg-2')`,
        [cardId, mailboxId, statementDate, total],
      );
    // Only a statement with nothing due may leave out the due date.
    await expect(insertWithoutDueDate('2026-08-26', 0)).resolves.toBeDefined();
    await expect(insertWithoutDueDate('2026-07-26', 100)).rejects.toThrow(
      /card_statements_due_date_required/,
    );
    await pool.query(`DELETE FROM mail_connections WHERE id = $1`, [mailboxId]);
    const remaining = await pool.query(`SELECT 1 FROM card_statements`);
    expect(remaining.rowCount).toBe(0);
  });
});
