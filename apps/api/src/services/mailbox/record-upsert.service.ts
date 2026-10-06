import type { Pool, PoolClient } from 'pg';
import pino from 'pino';
import { errorLoggerOptions } from '../../middleware/error.middleware';
import { firstRowOrThrow } from '../../utils/db.utils';
import { dayOfMonth, findByCycleDay, type CycleDayCandidate } from './cycle-day';
import type { CardStatementResult, ParsedResult } from '../../parsers/email-parser';

const logger = pino({ ...errorLoggerOptions, name: 'record-upsert' });

/** card_statements.attachment_filename is VARCHAR(255). */
const MAX_FILENAME_LENGTH = 255;
const EXTENSION = /\.[A-Za-z0-9]{1,5}$/;

/** Shortens an overlong email-supplied name to fit the column, keeping its extension. */
export const fitFilename = (filename: string): string => {
  if (filename.length <= MAX_FILENAME_LENGTH) return filename;
  const extension = EXTENSION.exec(filename)?.[0] ?? '';
  return filename.slice(0, MAX_FILENAME_LENGTH - extension.length) + extension;
};

/** A name-only card ($2 NULL) is outside the partial unique index, so this plainly inserts it. */
const UPSERT_CARD_SQL = `INSERT INTO credit_cards (pan_profile_id, source, card_number_last4, card_name, issuing_bank,
                           card_variant, billing_cycle_day)
   VALUES ($1, 'EMAIL', $2, $3, $4, 'OTHER', $5)
   ON CONFLICT (pan_profile_id, issuing_bank, card_number_last4)
     WHERE source = 'EMAIL' AND card_number_last4 IS NOT NULL
   DO UPDATE SET card_name = COALESCE(EXCLUDED.card_name, credit_cards.card_name),
     billing_cycle_day = COALESCE(credit_cards.billing_cycle_day, EXCLUDED.billing_cycle_day),
     updated_at = NOW()
   RETURNING id`;

/**
 * Serialises matching per (PAN, bank, name) until commit: two mailboxes syncing at once must not
 * both miss the other's new card and insert it twice.
 */
const LOCK_NAMED_CARD_SQL = `SELECT pg_advisory_xact_lock(hashtextextended($1 || '|' || $2 || '|' || $3, 0))`;

const FIND_NAMED_CARDS_SQL = `SELECT id, billing_cycle_day FROM credit_cards
   WHERE pan_profile_id = $1 AND source = 'EMAIL' AND card_number_last4 IS NULL
     AND issuing_bank = $2 AND card_name = $3`;

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
      const creditCardId = await this.upsertCard(client, panProfileId, result);
      await this.insertStatement(client, creditCardId, mailboxId, result, messageId);
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
    const cycleDay = dayOfMonth(statement.statementDate);
    if (statement.last4 === undefined && statement.cardName !== undefined) {
      const { issuingBank, cardName } = statement;
      return this.findOrInsertNamedCard(client, panProfileId, issuingBank, cardName, cycleDay);
    }
    return this.upsertCardRow(client, [
      panProfileId,
      statement.last4 ?? null,
      statement.cardName ?? null,
      statement.issuingBank,
      cycleDay,
    ]);
  }

  /** A card known only by name is the same-named card whose statements fall on the same day. */
  private async findOrInsertNamedCard(
    client: PoolClient,
    panProfileId: string,
    issuingBank: string,
    cardName: string,
    cycleDay: number,
  ): Promise<string> {
    const key = [panProfileId, issuingBank, cardName];
    await client.query(LOCK_NAMED_CARD_SQL, key);
    const { rows: candidates } = await client.query<CycleDayCandidate>(FIND_NAMED_CARDS_SQL, key);
    const match = findByCycleDay(candidates, cycleDay);
    if (match) return match.id;
    return this.upsertCardRow(client, [panProfileId, null, cardName, issuingBank, cycleDay]);
  }

  private async upsertCardRow(client: PoolClient, params: unknown[]): Promise<string> {
    const { rows } = await client.query<{ id: string }>(UPSERT_CARD_SQL, params);
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
      statement.dueDate ?? null,
      statement.totalDue,
      statement.minDue ?? null,
      statement.passwordHint ?? null,
      messageId,
      statement.attachment?.locator ?? null,
      statement.attachment ? fitFilename(statement.attachment.filename) : null,
    ]);
  }
}
