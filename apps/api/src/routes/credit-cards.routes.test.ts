import request from 'supertest';
import { createApp } from '../app';
import { signAccessToken } from '../utils/token.utils';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

const mockDb = { query: jest.fn() };

const app = createApp({
  db: mockDb as never,
  jwtSecret: JWT_SECRET,
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
});

const validToken = signAccessToken(
  { userId: 'user-uuid', username: 'u', email: 'e@e.com', hasPan: true },
  JWT_SECRET,
);

afterEach(() => jest.clearAllMocks());

describe('GET /api/v1/credit-cards', () => {
  it('should return 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/credit-cards');
    expect(res.status).toBe(401);
  });

  it('should return 403 when user has no PAN profile', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/credit-cards')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PAN_NOT_REGISTERED');
  });

  it('should return 200 with empty cards array when no cards exist', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pan-uuid' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/credit-cards')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
  });

  it('should return 200 with card list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pan-uuid' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'card-1',
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
          mailbox_ids: ['mb-1'],
        },
      ],
    });
    const res = await request(app)
      .get('/api/v1/credit-cards')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].cardNumberLast4).toBe('4242');
    expect(res.body.cards[0].creditLimit).toBe(500000);
    expect(res.body.cards[0].latestStatement).toBeNull();
    expect(res.body.cards[0].mailboxIds).toEqual(['mb-1']);
  });
});

describe('GET /api/v1/credit-cards/:cardId/statements', () => {
  const CARD_ID = '550e8400-e29b-41d4-a716-446655440001';
  const url = `/api/v1/credit-cards/${CARD_ID}/statements`;

  it('should return 401 when not authenticated', async () => {
    const res = await request(app).get(url);
    expect(res.status).toBe(401);
  });

  it('should return 422 for a card ID that is not a UUID', async () => {
    const res = await request(app)
      .get('/api/v1/credit-cards/not-a-uuid/statements')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(422);
    expect(mockDb.query).not.toHaveBeenCalledWith(
      expect.stringContaining('pan_profiles'),
      expect.anything(),
    );
  });

  it("should return 404 for a card not linked to the user's PAN", async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pan-uuid' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(url).set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CARD_NOT_FOUND');
  });

  it('should return 200 with the card and its statements', async () => {
    const statement = {
      id: 'stmt-1',
      statementDate: '2026-09-05',
      dueDate: '2026-09-25',
      totalAmountDue: 12345.67,
      minimumAmountDue: null,
      passwordHint: null,
      downloadAvailable: false,
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pan-uuid' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: CARD_ID,
            card_number_last4: '4242',
            card_name: null,
            card_network: 'VISA',
            issuing_bank: 'HDFC Bank',
            card_variant: 'PLATINUM',
            expiry_month: null,
            expiry_year: null,
            name_on_card: null,
            status: 'ACTIVE',
            credit_limit: null,
            available_credit: null,
            current_balance: null,
            billing_cycle_day: null,
            latest_statement: statement,
            mailbox_ids: [],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ statement }] });
    const res = await request(app).get(url).set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.card.id).toBe(CARD_ID);
    expect(res.body.statements).toEqual([statement]);
  });
});
