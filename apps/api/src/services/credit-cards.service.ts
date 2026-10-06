import type { Pool } from 'pg';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';
import { requirePanProfileId } from './pan-profile.lookup';
import { deriveCardStatus, type CardStatus, type StoredCardStatus } from './card-status';

const HTTP_NOT_FOUND = 404;

interface CreditCardRow {
  id: string;
  card_number_last4: string | null;
  card_name: string | null;
  card_network: string | null;
  issuing_bank: string;
  card_variant: string;
  expiry_month: number | null;
  expiry_year: number | null;
  name_on_card: string | null;
  status: StoredCardStatus;
  credit_limit: string | null;
  available_credit: string | null;
  current_balance: string | null;
  billing_cycle_day: number | null;
  /** Built in SQL as JSON, so amounts arrive as numbers and dates as YYYY-MM-DD. */
  latest_statement: CardStatement | null;
  mailbox_ids: string[];
  /** The newest successful sync among the mailboxes holding a statement of the latest one's date. */
  last_synced_at: Date | null;
}

export interface CardStatement {
  id: string;
  statementDate: string; // YYYY-MM-DD
  /** Null only when nothing is due. */
  dueDate: string | null; // YYYY-MM-DD
  totalAmountDue: number;
  minimumAmountDue: number | null;
  passwordHint: string | null;
  /** False when the email had no PDF, so there is nothing to download. */
  downloadAvailable: boolean;
}

export interface CreditCard {
  id: string;
  /** Null for a card whose bank's emails never show its digits; cardName then names it. */
  cardNumberLast4: string | null;
  cardName: string | null;
  cardNetwork: string | null;
  issuingBank: string;
  cardVariant: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  nameOnCard: string | null;
  status: CardStatus;
  creditLimit: number | null;
  availableCredit: number | null;
  currentBalance: number | null;
  billingCycleDay: number | null;
  latestStatement: CardStatement | null;
  /** The linked mailboxes this card's statements were found in; empty for none. */
  mailboxIds: string[];
}

/** Each cycle's preferred row first: the email with the PDF, then the newest one. */
const CYCLE_PREFERENCE = `(attachment_locator IS NOT NULL) DESC, statement_date DESC, created_at DESC`;

/** One billing cycle: its due date, or its statement date when nothing was due. */
const BILLING_CYCLE = `COALESCE(due_date, statement_date)`;

const STATEMENT_JSON = `json_build_object(
            'id', s.id,
            'statementDate', s.statement_date,
            'dueDate', s.due_date,
            'totalAmountDue', s.total_amount_due,
            'minimumAmountDue', s.minimum_amount_due,
            'passwordHint', s.password_hint,
            'downloadAvailable', s.attachment_locator IS NOT NULL
          )`;

/**
 * Cards with the mailboxes they were found in, and their latest statement across all mailboxes: the newest billing cycle, preferring a row with a PDF, so a reminder email for the
 * same cycle cannot hide the statement.
 */
const CARDS_SQL = `SELECT c.id, c.card_number_last4, c.card_name, c.card_network, c.issuing_bank, c.card_variant,
          c.expiry_month, c.expiry_year, c.name_on_card, c.status,
          c.credit_limit, c.available_credit, c.current_balance, c.billing_cycle_day,
          CASE WHEN s.id IS NULL THEN NULL ELSE ${STATEMENT_JSON} END AS latest_statement,
          ARRAY(
            SELECT DISTINCT mail_connection_id::text
            FROM card_statements
            WHERE credit_card_id = c.id
            ORDER BY 1
          ) AS mailbox_ids,
          (
            SELECT MAX(m.last_synced_at)
            FROM card_statements cs
            JOIN mail_connections m ON m.id = cs.mail_connection_id
            WHERE cs.credit_card_id = c.id AND cs.statement_date = s.statement_date
          ) AS last_synced_at
   FROM credit_cards c
   LEFT JOIN LATERAL (
     SELECT id, statement_date, due_date, total_amount_due, minimum_amount_due, password_hint,
            attachment_locator
     FROM card_statements
     WHERE credit_card_id = c.id
     ORDER BY ${BILLING_CYCLE} DESC, ${CYCLE_PREFERENCE}
     LIMIT 1
   ) s ON TRUE
   WHERE c.pan_profile_id = $1`;

const LIST_CARDS_SQL = `${CARDS_SQL}
   ORDER BY c.created_at DESC`;

const GET_CARD_SQL = `${CARDS_SQL} AND c.id = $2`;

/**
 * One statement per billing cycle (preferring the email with the PDF) issued in the current month
 * or the 11 before it, newest first. Scoped to the PAN as well, so it runs alongside the card query.
 */
const STATEMENT_HISTORY_SQL = `SELECT ${STATEMENT_JSON} AS statement
   FROM (
     SELECT DISTINCT ON (${BILLING_CYCLE})
            id, statement_date, due_date, total_amount_due, minimum_amount_due, password_hint,
            attachment_locator
     FROM card_statements
     WHERE credit_card_id = (SELECT id FROM credit_cards WHERE pan_profile_id = $1 AND id = $2)
       AND statement_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
     ORDER BY ${BILLING_CYCLE}, ${CYCLE_PREFERENCE}
   ) s
   ORDER BY s.statement_date DESC`;

export interface CardStatementHistory {
  card: CreditCard;
  /** Up to 12 months of statements, one per billing cycle, newest first. */
  statements: CardStatement[];
}

const toDecimal = (v: string | null): number | null => (v !== null ? parseFloat(v) : null);

const toCard = (row: CreditCardRow): CreditCard => ({
  id: row.id,
  cardNumberLast4: row.card_number_last4,
  cardName: row.card_name,
  cardNetwork: row.card_network,
  issuingBank: row.issuing_bank,
  cardVariant: row.card_variant,
  expiryMonth: row.expiry_month,
  expiryYear: row.expiry_year,
  nameOnCard: row.name_on_card,
  status: deriveCardStatus(
    row.status,
    row.latest_statement?.statementDate ?? null,
    row.last_synced_at,
  ),
  creditLimit: toDecimal(row.credit_limit),
  availableCredit: toDecimal(row.available_credit),
  currentBalance: toDecimal(row.current_balance),
  billingCycleDay: row.billing_cycle_day,
  latestStatement: row.latest_statement,
  mailboxIds: row.mailbox_ids,
});

export class CreditCardsService {
  constructor(private readonly db: Pool) {}

  async listByUserId(userId: string, lng: string): Promise<CreditCard[]> {
    const panProfileId = await requirePanProfileId(this.db, userId, lng);
    const { rows } = await this.db.query<CreditCardRow>(LIST_CARDS_SQL, [panProfileId]);
    return rows.map(toCard);
  }

  /** A card that is not linked to the user's PAN is reported as not found, never as forbidden. */
  async getStatementHistory(
    userId: string,
    cardId: string,
    lng: string,
  ): Promise<CardStatementHistory> {
    const panProfileId = await requirePanProfileId(this.db, userId, lng);
    const params = [panProfileId, cardId];
    const [{ rows: cardRows }, { rows: statementRows }] = await Promise.all([
      this.db.query<CreditCardRow>(GET_CARD_SQL, params),
      this.db.query<{ statement: CardStatement }>(STATEMENT_HISTORY_SQL, params),
    ]);
    const cardRow = cardRows[0];
    if (!cardRow) {
      throw new AppError(
        'CARD_NOT_FOUND',
        HTTP_NOT_FOUND,
        i18next.t('error.card_not_found', { lng }),
      );
    }
    return { card: toCard(cardRow), statements: statementRows.map((row) => row.statement) };
  }
}
