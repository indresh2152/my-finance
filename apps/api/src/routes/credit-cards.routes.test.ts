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
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pan-uuid' }] })
      .mockResolvedValueOnce({
        rows: [{
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
        }],
      });
    const res = await request(app)
      .get('/api/v1/credit-cards')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].cardNumberLast4).toBe('4242');
    expect(res.body.cards[0].creditLimit).toBe(500000);
  });
});
