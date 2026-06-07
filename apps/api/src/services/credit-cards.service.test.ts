import { CreditCardsService } from './credit-cards.service';
import { AppError } from '../middleware/error.middleware';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PAN_PROFILE_ID = 'pan-profile-uuid';
const LNG = 'en';

const makeDb = (): { query: jest.Mock } => ({ query: jest.fn() });

const mockCardRow = {
  id: 'card-uuid',
  card_number_last4: '4242',
  card_network: 'VISA',
  issuing_bank: 'HDFC Bank',
  card_variant: 'PLATINUM',
  expiry_month: 12,
  expiry_year: 2027,
  name_on_card: 'Test User',
  status: 'ACTIVE',
  credit_limit: '500000.00',
  available_credit: '350000.00',
  current_balance: '150000.00',
  billing_cycle_day: 15,
};

describe('CreditCardsService.listByUserId', () => {
  it('should throw PAN_NOT_REGISTERED when user has no PAN profile', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const service = new CreditCardsService(db as never);
    await expect(service.listByUserId(USER_ID, LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_NOT_REGISTERED' }),
    );
  });

  it('should return an empty array when no cards are linked to the PAN', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new CreditCardsService(db as never);
    const result = await service.listByUserId(USER_ID, LNG);
    expect(result).toEqual([]);
  });

  it('should return mapped cards with camelCase fields', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [mockCardRow] });
    const service = new CreditCardsService(db as never);
    const result = await service.listByUserId(USER_ID, LNG);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'card-uuid',
      cardNumberLast4: '4242',
      cardNetwork: 'VISA',
      issuingBank: 'HDFC Bank',
      creditLimit: 500000,
      availableCredit: 350000,
      currentBalance: 150000,
    });
  });

  it('should handle null monetary values', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({
        rows: [{ ...mockCardRow, credit_limit: null, available_credit: null, current_balance: null }],
      });
    const service = new CreditCardsService(db as never);
    const result = await service.listByUserId(USER_ID, LNG);
    expect(result[0]!.creditLimit).toBeNull();
    expect(result[0]!.availableCredit).toBeNull();
    expect(result[0]!.currentBalance).toBeNull();
  });
});
