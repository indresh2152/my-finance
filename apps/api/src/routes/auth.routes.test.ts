import request from 'supertest';
import { createApp } from '../app';
import { signAccessToken, signRefreshToken, hashToken } from '../utils/token.utils';
import bcrypt from 'bcryptjs';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';
const REFRESH_SECRET = 'test-refresh-secret-32-chars-min!!';

const mockDb = { query: jest.fn() };

const app = createApp({
  db: mockDb as never,
  jwtSecret: JWT_SECRET,
  refreshTokenSecret: REFRESH_SECRET,
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
});

// The audit middleware fires pool.query asynchronously after the response is sent.
// A default mock value ensures those unexpected calls return a valid Promise
// instead of undefined (which would cause a TypeError in the .catch() chain).
beforeEach(() => {
  mockDb.query.mockResolvedValue({ rows: [] });
});
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
        rows: [
          {
            id: 'uid',
            username: 'testuser',
            email: 'test@e.com',
            password_hash: hash,
            pan_masked: null,
          },
        ],
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
      .mockResolvedValueOnce({
        rows: [{ id: 'uid', username: 'u', email: 'e@e.com', pan_masked: null }],
      })
      .mockResolvedValueOnce({ rows: [] }); // new token insert
    void tokenHash;
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^refreshToken=;.*Path=\/api\/v1\/auth\/refresh/),
        expect.stringMatching(
          /^refreshToken=[^;]+; Max-Age=604800;.*Path=\/api\/v1\/auth;.*HttpOnly/,
        ),
      ]),
    );
  });
});

describe('POST /api/v1/auth/refresh failure', () => {
  it('should clear the refresh cookies when the token is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refreshToken=not-a-valid-jwt');
    expect(res.status).toBe(401);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^refreshToken=;.*Path=\/api\/v1\/auth;/),
        expect.stringMatching(/^refreshToken=;.*Path=\/api\/v1\/auth\/refresh/),
      ]),
    );
  });

  it('should keep the cookie when refresh fails for a server reason', async () => {
    const token = signRefreshToken('uid', REFRESH_SECRET);
    mockDb.query.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${token}`);
    expect(res.status).toBe(500);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('DELETE /api/v1/auth/logout', () => {
  const accessToken = signAccessToken(
    { userId: 'uid', username: 'u', email: 'e@e.com', hasPan: false },
    JWT_SECRET,
  );

  it('should revoke the refresh token sent with the logout request', async () => {
    const refreshToken = signRefreshToken('uid', REFRESH_SECRET);
    const res = await request(app)
      .delete('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', `refreshToken=${refreshToken}`);
    expect(res.status).toBe(204);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_tokens SET revoked_at'),
      [hashToken(refreshToken)],
    );
  });

  it('should clear the cookie at both the current and legacy paths', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^refreshToken=;.*Path=\/api\/v1\/auth;/),
        expect.stringMatching(/^refreshToken=;.*Path=\/api\/v1\/auth\/refresh/),
      ]),
    );
  });

  it('should revoke the refresh cookie without an access token', async () => {
    const refreshToken = signRefreshToken('uid', REFRESH_SECRET);
    const res = await request(app)
      .delete('/api/v1/auth/logout')
      .set('Cookie', `refreshToken=${refreshToken}`);
    expect(res.status).toBe(204);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_tokens SET revoked_at'),
      [hashToken(refreshToken)],
    );
  });

  it('should succeed and clear cookies when there is no session at all', async () => {
    const res = await request(app).delete('/api/v1/auth/logout');
    expect(res.status).toBe(204);
    expect(mockDb.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_tokens'),
      expect.anything(),
    );
  });
});
