import type { Pool } from 'pg';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';

interface CreditCardRow {
  id: string;
  card_number_last4: string;
  card_network: string;
  issuing_bank: string;
  card_variant: string;
  expiry_month: number;
  expiry_year: number;
  name_on_card: string;
  status: string;
  credit_limit: string | null;
  available_credit: string | null;
  current_balance: string | null;
  billing_cycle_day: number | null;
}

export interface CreditCard {
  id: string;
  cardNumberLast4: string;
  cardNetwork: string;
  issuingBank: string;
  cardVariant: string;
  expiryMonth: number;
  expiryYear: number;
  nameOnCard: string;
  status: string;
  creditLimit: number | null;
  availableCredit: number | null;
  currentBalance: number | null;
  billingCycleDay: number | null;
}

const toDecimal = (v: string | null): number | null => (v !== null ? parseFloat(v) : null);

const toCard = (row: CreditCardRow): CreditCard => ({
  id: row.id,
  cardNumberLast4: row.card_number_last4,
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
});

export class CreditCardsService {
  constructor(private readonly db: Pool) {}

  async listByUserId(userId: string, lng: string): Promise<CreditCard[]> {
    const panRes = await this.db.query<{ id: string }>(
      'SELECT id FROM pan_profiles WHERE user_id = $1',
      [userId],
    );

    if (panRes.rows.length === 0) {
      throw new AppError('PAN_NOT_REGISTERED', 403, i18next.t('error.pan_not_registered', { lng }));
    }

    const panProfileId = panRes.rows[0]!.id;

    const { rows } = await this.db.query<CreditCardRow>(
      `SELECT id, card_number_last4, card_network, issuing_bank, card_variant,
              expiry_month, expiry_year, name_on_card, status,
              credit_limit, available_credit, current_balance, billing_cycle_day
       FROM credit_cards
       WHERE pan_profile_id = $1
       ORDER BY created_at DESC`,
      [panProfileId],
    );

    return rows.map(toCard);
  }
}
