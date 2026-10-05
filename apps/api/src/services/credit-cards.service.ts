import type { Pool } from 'pg';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';

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
  status: string;
  credit_limit: string | null;
  available_credit: string | null;
  current_balance: string | null;
  billing_cycle_day: number | null;
  /** Built in SQL as JSON, so amounts arrive as numbers and dates as YYYY-MM-DD. */
  latest_statement: CardStatement | null;
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
  status: string;
  creditLimit: number | null;
  availableCredit: number | null;
  currentBalance: number | null;
  billingCycleDay: number | null;
  latestStatement: CardStatement | null;
}

/**
 * Latest statement per card across all mailboxes: the newest billing cycle (its due date, or its
 * statement date when nothing was due), preferring a row with a PDF, so a reminder email for the
 * same cycle cannot hide the statement.
 */
const LIST_CARDS_SQL = `SELECT c.id, c.card_number_last4, c.card_name, c.card_network, c.issuing_bank, c.card_variant,
          c.expiry_month, c.expiry_year, c.name_on_card, c.status,
          c.credit_limit, c.available_credit, c.current_balance, c.billing_cycle_day,
          CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object(
            'id', s.id,
            'statementDate', s.statement_date,
            'dueDate', s.due_date,
            'totalAmountDue', s.total_amount_due,
            'minimumAmountDue', s.minimum_amount_due,
            'passwordHint', s.password_hint,
            'downloadAvailable', s.attachment_locator IS NOT NULL
          ) END AS latest_statement
   FROM credit_cards c
   LEFT JOIN LATERAL (
     SELECT id, statement_date, due_date, total_amount_due, minimum_amount_due, password_hint,
            attachment_locator
     FROM card_statements
     WHERE credit_card_id = c.id
     ORDER BY COALESCE(due_date, statement_date) DESC, (attachment_locator IS NOT NULL) DESC, statement_date DESC, created_at DESC
     LIMIT 1
   ) s ON TRUE
   WHERE c.pan_profile_id = $1
   ORDER BY c.created_at DESC`;

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
  status: row.status,
  creditLimit: toDecimal(row.credit_limit),
  availableCredit: toDecimal(row.available_credit),
  currentBalance: toDecimal(row.current_balance),
  billingCycleDay: row.billing_cycle_day,
  latestStatement: row.latest_statement,
});

export class CreditCardsService {
  constructor(private readonly db: Pool) {}

  async listByUserId(userId: string, lng: string): Promise<CreditCard[]> {
    const panRes = await this.db.query<{ id: string }>(
      'SELECT id FROM pan_profiles WHERE user_id = $1',
      [userId],
    );

    const panProfile = panRes.rows[0];
    if (!panProfile) {
      throw new AppError('PAN_NOT_REGISTERED', 403, i18next.t('error.pan_not_registered', { lng }));
    }

    const panProfileId = panProfile.id;

    const { rows } = await this.db.query<CreditCardRow>(LIST_CARDS_SQL, [panProfileId]);

    return rows.map(toCard);
  }
}
