import type { Pool, PoolClient } from 'pg';
import pino from 'pino';
import { errorLoggerOptions } from '../../middleware/error.middleware';
import { firstRowOrThrow } from '../../utils/db.utils';
import type {
  AccountBalanceResult,
  CardStatementResult,
  ParsedResult,
} from '../../parsers/email-parser';

const logger = pino({ ...errorLoggerOptions, name: 'record-upsert' });

const DEFAULT_ACCOUNT_TYPE = 'OTHER';

const UPSERT_CARD_SQL = `INSERT INTO credit_cards (pan_profile_id, source, card_number_last4, issuing_bank, card_variant)
   VALUES ($1, 'EMAIL', $2, $3, 'OTHER')
   ON CONFLICT (pan_profile_id, issuing_bank, card_number_last4) WHERE source = 'EMAIL'
   DO UPDATE SET updated_at = NOW()
   RETURNING id`;

const UPSERT_STATEMENT_SQL = `INSERT INTO card_statements (credit_card_id, mail_connection_id, statement_date, due_date, total_amount_due,
                                    minimum_amount_due, password_hint, source_message_id, attachment_locator,
                                    attachment_filename)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
   ON CONFLICT (credit_card_id, mail_connection_id, statement_date) DO UPDATE SET
     due_date = EXCLUDED.due_date,
     total_amount_due = EXCLUDED.total_amount_due,
     minimum_amount_due = EXCLUDED.minimum_amount_due,
     password_hint = EXCLUDED.password_hint,
     source_message_id = EXCLUDED.source_message_id,
     attachment_locator = EXCLUDED.attachment_locator,
     attachment_filename = EXCLUDED.attachment_filename`;

const UPSERT_ACCOUNT_SQL = `INSERT INTO bank_accounts (pan_profile_id, source, account_number_last4, bank_name, account_type)
   VALUES ($1, 'EMAIL', $2, $3, $4)
   ON CONFLICT (pan_profile_id, bank_name, account_number_last4) WHERE source = 'EMAIL'
   DO UPDATE SET
     account_type = CASE WHEN bank_accounts.account_type = 'OTHER' THEN EXCLUDED.account_type
                         ELSE bank_accounts.account_type END,
     updated_at = NOW()
   RETURNING id`;

const UPSERT_BALANCE_SQL = `INSERT INTO account_balance_snapshots (bank_account_id, mail_connection_id, available_balance, balance_as_of,
                                              source_message_id)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (bank_account_id, mail_connection_id) DO UPDATE SET
     available_balance = EXCLUDED.available_balance,
     balance_as_of = EXCLUDED.balance_as_of,
     source_message_id = EXCLUDED.source_message_id,
     updated_at = NOW()
   WHERE account_balance_snapshots.balance_as_of < EXCLUDED.balance_as_of`;

/** Applies one parsed email to the database. Idempotent: re-applying the same email changes nothing. */
export class RecordUpsertService {
  constructor(private readonly pool: Pick<Pool, 'connect'>) {}

  async apply(
    panProfileId: string,
    mailboxId: string,
    result: ParsedResult,
    messageId: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (result.kind === 'CARD_STATEMENT') {
        await this.applyStatement(client, panProfileId, mailboxId, result, messageId);
      } else {
        await this.applyBalance(client, panProfileId, mailboxId, result, messageId);
      }
      await client.query('COMMIT');
    } catch (err) {
      // Isolated so a failing ROLLBACK can never mask the original error below.
      await this.safeRollback(client);
      throw err;
    } finally {
      client.release();
    }
  }

  private async safeRollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'record-upsert rollback failed');
    }
  }

  private async upsertCard(
    client: PoolClient,
    panProfileId: string,
    statement: CardStatementResult,
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(UPSERT_CARD_SQL, [
      panProfileId,
      statement.last4,
      statement.issuingBank,
    ]);
    return firstRowOrThrow(rows, 'credit_cards upsert').id;
  }

  private async insertStatement(
    client: PoolClient,
    creditCardId: string,
    mailboxId: string,
    statement: CardStatementResult,
    messageId: string,
  ): Promise<void> {
    await client.query(UPSERT_STATEMENT_SQL, [
      creditCardId,
      mailboxId,
      statement.statementDate,
      statement.dueDate,
      statement.totalDue,
      statement.minDue ?? null,
      statement.passwordHint ?? null,
      messageId,
      statement.attachment?.locator ?? null,
      statement.attachment?.filename ?? null,
    ]);
  }

  private async applyStatement(
    client: PoolClient,
    panProfileId: string,
    mailboxId: string,
    statement: CardStatementResult,
    messageId: string,
  ): Promise<void> {
    const creditCardId = await this.upsertCard(client, panProfileId, statement);
    await this.insertStatement(client, creditCardId, mailboxId, statement, messageId);
  }

  private async upsertAccount(
    client: PoolClient,
    panProfileId: string,
    balance: AccountBalanceResult,
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(UPSERT_ACCOUNT_SQL, [
      panProfileId,
      balance.last4,
      balance.bankName,
      balance.accountType ?? DEFAULT_ACCOUNT_TYPE,
    ]);
    return firstRowOrThrow(rows, 'bank_accounts upsert').id;
  }

  private async insertBalanceSnapshot(
    client: PoolClient,
    bankAccountId: string,
    mailboxId: string,
    balance: AccountBalanceResult,
    messageId: string,
  ): Promise<void> {
    await client.query(UPSERT_BALANCE_SQL, [
      bankAccountId,
      mailboxId,
      balance.balance,
      balance.asOf,
      messageId,
    ]);
  }

  private async applyBalance(
    client: PoolClient,
    panProfileId: string,
    mailboxId: string,
    balance: AccountBalanceResult,
    messageId: string,
  ): Promise<void> {
    const bankAccountId = await this.upsertAccount(client, panProfileId, balance);
    await this.insertBalanceSnapshot(client, bankAccountId, mailboxId, balance, messageId);
  }
}
