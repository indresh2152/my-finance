import { CreditCardsService } from './credit-cards.service';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PAN_PROFILE_ID = 'pan-profile-uuid';
const LNG = 'en';

/** A card whose newest statement is 97 days older than its mailbox's last sync. */
const dormant = {
  latest_statement: { id: 'stmt-1', statementDate: '2026-07-01' },
  last_synced_at: new Date('2026-10-06T08:00:00Z'),
};

const makeDb = (): { query: jest.Mock } => ({ query: jest.fn() });

const mockCardRow = {
  id: 'card-uuid',
  card_number_last4: '4242',
  card_name: null,
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
  mailbox_ids: [],
  last_synced_at: null,
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
    expect(cardsSql).toContain('c.card_name');
    expect(result).toEqual([
      expect.objectContaining({
        cardNetwork: null,
        expiryMonth: null,
        expiryYear: null,
        nameOnCard: null,
      }),
    ]);
  });

  it('should name a card whose emails never show its digits', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] }).mockResolvedValueOnce({
      rows: [{ ...mockCardRow, card_number_last4: null, card_name: 'Pixel Play' }],
    });
    const result = await new CreditCardsService(db as never).listByUserId(USER_ID, LNG);
    expect(result[0]).toMatchObject({ cardNumberLast4: null, cardName: 'Pixel Play' });
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
      'ORDER BY COALESCE(due_date, statement_date) DESC, (attachment_locator IS NOT NULL) DESC, statement_date DESC',
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

  it('should list the mailboxes the card was found in', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] }).mockResolvedValueOnce({
      rows: [{ ...mockCardRow, mailbox_ids: ['mb-1', 'mb-2'] }],
    });
    const [card] = await new CreditCardsService(db as never).listByUserId(USER_ID, LNG);
    expect(card?.mailboxIds).toEqual(['mb-1', 'mb-2']);
  });

  it('should report a card with no statement in the 70 days before its last sync as inactive', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] }).mockResolvedValueOnce({
      rows: [{ ...mockCardRow, ...dormant }],
    });
    const [card] = await new CreditCardsService(db as never).listByUserId(USER_ID, LNG);
    expect(card?.status).toBe('INACTIVE');
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

describe('CreditCardsService.getStatementHistory', () => {
  const CARD_ID = 'card-uuid';
  const statement = {
    id: 'stmt-1',
    statementDate: '2026-09-05',
    dueDate: '2026-09-25',
    totalAmountDue: 12345.67,
    minimumAmountDue: 620,
    passwordHint: null,
    downloadAvailable: true,
  };

  it('should throw PAN_NOT_REGISTERED when user has no PAN profile', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      new CreditCardsService(db as never).getStatementHistory(USER_ID, CARD_ID, LNG),
    ).rejects.toThrow(expect.objectContaining({ code: 'PAN_NOT_REGISTERED' }));
  });

  it("should report a card not linked to the user's PAN as not found", async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [] });

    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      new CreditCardsService(db as never).getStatementHistory(USER_ID, CARD_ID, LNG),
    ).rejects.toThrow(expect.objectContaining({ code: 'CARD_NOT_FOUND', status: 404 }));
    expect(db.query.mock.calls[1]?.[1]).toEqual([PAN_PROFILE_ID, CARD_ID]);
  });

  it('should return the card and one statement per billing cycle from the last 12 months', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [mockCardRow] })
      .mockResolvedValueOnce({ rows: [{ statement }] });

    const result = await new CreditCardsService(db as never).getStatementHistory(
      USER_ID,
      CARD_ID,
      LNG,
    );

    const cardSql = db.query.mock.calls[1]?.[0] as string;
    expect(cardSql).toContain('WHERE c.pan_profile_id = $1 AND c.id = $2');
    const [historySql, historyParams] = db.query.mock.calls[2] as [string, string[]];
    expect(historyParams).toEqual([PAN_PROFILE_ID, CARD_ID]);
    expect(historySql).toContain(
      'credit_card_id = (SELECT id FROM credit_cards WHERE pan_profile_id = $1 AND id = $2)',
    );
    expect(historySql).toContain('DISTINCT ON (COALESCE(due_date, statement_date))');
    expect(historySql).toContain("date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'");
    expect(historySql).toContain('(attachment_locator IS NOT NULL) DESC');
    expect(historySql).toContain('ORDER BY s.statement_date DESC');
    expect(result).toEqual({
      card: expect.objectContaining({ id: 'card-uuid', creditLimit: 500000 }),
      statements: [statement],
    });
  });

  it('should report the card as inactive when it has gone quiet', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...mockCardRow, ...dormant }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await new CreditCardsService(db as never).getStatementHistory(
      USER_ID,
      CARD_ID,
      LNG,
    );
    expect(result.card.status).toBe('INACTIVE');
  });

  it('should return no statements for a card that has none', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: PAN_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [mockCardRow] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await new CreditCardsService(db as never).getStatementHistory(
      USER_ID,
      CARD_ID,
      LNG,
    );
    expect(result.statements).toEqual([]);
  });
});
