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
  { userId: 'user-uuid', username: 'u', email: 'e@e.com', hasPan: false },
  JWT_SECRET,
);

afterEach(() => jest.clearAllMocks());

describe('POST /api/v1/pan/register', () => {
  it('should return 401 when not authenticated', async () => {
    const res = await request(app).post('/api/v1/pan/register').send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(401);
  });

  it('should return 422 when PAN format is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/pan/register')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pan: 'INVALID' });
    expect(res.status).toBe(422);
  });

  it('should return 409 when PAN is already registered', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    const res = await request(app)
      .post('/api/v1/pan/register')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAN_ALREADY_REGISTERED');
  });

  it('should return 201 on successful PAN registration', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no existing PAN
      .mockResolvedValueOnce({
        rows: [{ id: 'pan-uuid', pan_masked: 'ABCDE####F', verified_at: null }],
      });
    const res = await request(app)
      .post('/api/v1/pan/register')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(201);
    expect(res.body.panMasked).toBe('ABCDE####F');
  });
});

describe('GET /api/v1/pan', () => {
  it('should return 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/pan');
    expect(res.status).toBe(401);
  });

  it('should return 404 when no PAN is registered', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/pan')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PAN_NOT_REGISTERED');
  });

  it('should return 200 with PAN profile', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'pan-uuid', pan_masked: 'ABCDE####F', verified_at: null }],
    });
    const res = await request(app)
      .get('/api/v1/pan')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.panMasked).toBe('ABCDE####F');
  });
});
