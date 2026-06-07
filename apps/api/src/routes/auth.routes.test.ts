import request from 'supertest';
import { createApp } from '../app';
import { signRefreshToken, hashToken } from '../utils/token.utils';
import bcrypt from 'bcryptjs';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';
const REFRESH_SECRET = 'test-refresh-secret-32-chars-min!!';

const mockDb = { query: jest.fn() };

const app = createApp({
  db: mockDb as never,
  jwtSecret: JWT_SECRET,
  refreshTokenSecret: REFRESH_SECRET,
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
});

// The audit middleware fires pool.query asynchronously after the response is sent.
// A default mock value ensures those unexpected calls return a valid Promise
// instead of undefined (which would cause a TypeError in the .catch() chain).
beforeEach(() => { mockDb.query.mockResolvedValue({ rows: [] }); });
afterEach(() => jest.resetAllMocks());

describe('POST /api/v1/auth/login', () => {
  it('should return 422 when body is invalid', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(422);
  });

  it('should return 401 when credentials are wrong', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'nobody', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 200 with accessToken on valid credentials', async () => {
    const hash = await bcrypt.hash('P@ss1234', 12);
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: 'uid', username: 'testuser', email: 'test@e.com', password_hash: hash, pan_masked: null }],
      })
      .mockResolvedValueOnce({ rows: [] }); // refresh token insert
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'testuser', password: 'P@ss1234' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.username).toBe('testuser');
  });
});

describe('POST /api/v1/auth/register', () => {
  it('should return 201 with accessToken on successful registration', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // username check
      .mockResolvedValueOnce({ rows: [] }) // email check
      .mockResolvedValueOnce({ rows: [{ id: 'new-uid', username: 'newuser', email: 'new@e.com' }] })
      .mockResolvedValueOnce({ rows: [] }); // refresh token
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'newuser', email: 'new@e.com', password: 'P@ss1234!' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('should return 409 when username is taken', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'taken', email: 'new@e.com', password: 'P@ss1234!' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('should return 401 when no refresh cookie is present', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('should return 200 with new accessToken on valid refresh token', async () => {
    const token = signRefreshToken('uid', REFRESH_SECRET);
    const tokenHash = hashToken(token);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'rt-1', revoked_at: null }] }) // token lookup
      .mockResolvedValueOnce({ rows: [] }) // revoke old
      .mockResolvedValueOnce({ rows: [{ id: 'uid', username: 'u', email: 'e@e.com', pan_masked: null }] })
      .mockResolvedValueOnce({ rows: [] }); // new token insert
    void tokenHash;
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });
});

describe('DELETE /api/v1/auth/logout', () => {
  it('should return 401 when not authenticated', async () => {
    const res = await request(app).delete('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});
