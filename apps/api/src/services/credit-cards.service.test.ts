import { CreditCardsService } from './credit-cards.service';

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
  latest_statement: null,
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
    db.query.mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] }).mockResolvedValueOnce({
      rows: [{ ...mockCardRow, credit_limit: null, available_credit: null, current_balance: null }],
    });
    const service = new CreditCardsService(db as never);
    const result = await service.listByUserId(USER_ID, LNG);
    expect(result).toEqual([
      expect.objectContaining({ creditLimit: null, availableCredit: null, currentBalance: null }),
    ]);
  });

  it('should list email-derived cards, whose identity fields are unknown', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] }).mockResolvedValueOnce({
      rows: [
        {
          ...mockCardRow,
          card_network: null,
          expiry_month: null,
          expiry_year: null,
          name_on_card: null,
        },
      ],
    });
    const service = new CreditCardsService(db as never);

    const result = await service.listByUserId(USER_ID, LNG);

    const cardsSql = db.query.mock.calls[1]?.[0] as string;
    expect(cardsSql).not.toContain('source');
    expect(result).toEqual([
      expect.objectContaining({
        cardNetwork: null,
        expiryMonth: null,
        expiryYear: null,
        nameOnCard: null,
      }),
    ]);
  });

  it('should attach the latest statement', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] }).mockResolvedValueOnce({
      rows: [
        {
          ...mockCardRow,
          latest_statement: {
            id: 'stmt-1',
            statementDate: '2026-09-05',
            dueDate: '2026-09-25',
            totalAmountDue: 12345.67,
            minimumAmountDue: null,
            passwordHint: 'First 4 letters of name + DDMM',
            downloadAvailable: true,
          },
        },
      ],
    });
    const service = new CreditCardsService(db as never);

    const [card] = await service.listByUserId(USER_ID, LNG);

    const cardsSql = db.query.mock.calls[1]?.[0] as string;
    expect(cardsSql).toContain(
      'ORDER BY due_date DESC, (attachment_locator IS NOT NULL) DESC, statement_date DESC',
    );
    expect(card?.latestStatement).toEqual({
      id: 'stmt-1',
      statementDate: '2026-09-05',
      dueDate: '2026-09-25',
      totalAmountDue: 12345.67,
      minimumAmountDue: null,
      passwordHint: 'First 4 letters of name + DDMM',
      downloadAvailable: true,
    });
  });

  it('should report no statement for a card that has none', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [mockCardRow] });
    const service = new CreditCardsService(db as never);
    const [card] = await service.listByUserId(USER_ID, LNG);
    expect(card?.latestStatement).toBeNull();
  });
});
