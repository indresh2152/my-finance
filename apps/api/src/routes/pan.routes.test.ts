jest.mock('../middleware/rateLimit.middleware', () => ({
  panRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  loginRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  registerRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import { createApp } from '../app';
import { signAccessToken } from '../utils/token.utils';
import { AppError } from '../middleware/error.middleware';
import type { PanVerifier } from '../services/pan.verifier';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

const mockDb = { query: jest.fn() };

const mockVerifier: PanVerifier = {
  verify: jest.fn().mockResolvedValue({ valid: true, holderName: 'JOHN DOE', status: 'VALID' }),
};

const app = createApp({
  db: mockDb as never,
  jwtSecret: JWT_SECRET,
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
  panVerifier: mockVerifier,
});

const validToken = signAccessToken(
  { userId: 'user-uuid', username: 'u', email: 'e@e.com', hasPan: false },
  JWT_SECRET,
);

afterEach(() => {
  jest.clearAllMocks();
  (mockVerifier.verify as jest.Mock).mockResolvedValue({
    valid: true,
    holderName: 'JOHN DOE',
    status: 'VALID',
  });
});

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

  it('should return 422 when Setu returns invalid PAN', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    (mockVerifier.verify as jest.Mock).mockResolvedValueOnce({ valid: false, status: 'INVALID' });
    const res = await request(app)
      .post('/api/v1/pan/register')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PAN_VERIFICATION_FAILED');
  });

  it('should return 502 when KYC service is unavailable', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    (mockVerifier.verify as jest.Mock).mockRejectedValueOnce(
      new AppError('PAN_KYC_UNAVAILABLE', 502, 'KYC unavailable'),
    );
    const res = await request(app)
      .post('/api/v1/pan/register')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAN_KYC_UNAVAILABLE');
  });

  it('should return 201 with non-null verifiedAt on successful registration', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pan-uuid',
            pan_masked: 'ABCDE####F',
            verified_at: '2026-06-07T00:00:00Z',
          },
        ],
      });
    const res = await request(app)
      .post('/api/v1/pan/register')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(201);
    expect(res.body.panMasked).toBe('ABCDE####F');
    expect(res.body.verifiedAt).toBe('2026-06-07T00:00:00Z');
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
      rows: [{ id: 'pan-uuid', pan_masked: 'ABCDE####F', verified_at: '2026-06-07T00:00:00Z' }],
    });
    const res = await request(app)
      .get('/api/v1/pan')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.panMasked).toBe('ABCDE####F');
  });
});
