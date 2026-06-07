import request from 'supertest';
import { createApp } from '../app';
import { signAccessToken } from '../utils/token.utils';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

const mockDb = { query: jest.fn() };

const app = createApp({
  db: mockDb as never,
  jwtSecret: JWT_SECRET,
  refreshTokenSecret: 'test-refresh-at-least-32-chars-min!',
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
});

const validToken = signAccessToken(
  { userId: 'user-uuid', username: 'testuser', email: 'test@example.com', hasPan: false },
  JWT_SECRET,
);

afterEach(() => jest.clearAllMocks());

describe('GET /api/v1/users/me', () => {
  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('should return user data with hasPan: false when no PAN profile exists', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'user-uuid', username: 'testuser', email: 'test@example.com', pan_masked: null }],
    });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'user-uuid',
      username: 'testuser',
      hasPan: false,
      panMasked: null,
    });
  });

  it('should return hasPan: true when PAN profile exists', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'user-uuid', username: 'testuser', email: 'test@example.com', pan_masked: 'ABCDE####F' }],
    });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.hasPan).toBe(true);
    expect(res.body.panMasked).toBe('ABCDE####F');
  });

  it('should return 404 when user is not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(404);
  });
});
