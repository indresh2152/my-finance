import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken } from './token.utils';
import type { AccessTokenPayload } from './token.utils';

const SECRET = 'test-access-secret-at-least-32-chars!!';
const REFRESH_SECRET = 'test-refresh-secret-at-least-32!!';

const PAYLOAD: AccessTokenPayload = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  username: 'testuser',
  email: 'test@example.com',
  hasPan: false,
};

describe('signAccessToken / verifyAccessToken', () => {
  it('should round-trip a valid access token', () => {
    const token = signAccessToken(PAYLOAD, SECRET);
    const decoded = verifyAccessToken(token, SECRET);
    expect(decoded.userId).toBe(PAYLOAD.userId);
    expect(decoded.username).toBe(PAYLOAD.username);
    expect(decoded.email).toBe(PAYLOAD.email);
    expect(decoded.hasPan).toBe(false);
  });

  it('should throw when verified with wrong secret', () => {
    const token = signAccessToken(PAYLOAD, SECRET);
    expect(() => verifyAccessToken(token, 'wrong-secret')).toThrow();
  });

  it('should throw when token is malformed', () => {
    expect(() => verifyAccessToken('not.a.jwt', SECRET)).toThrow();
  });

  it('should encode hasPan: true correctly', () => {
    const token = signAccessToken({ ...PAYLOAD, hasPan: true }, SECRET);
    expect(verifyAccessToken(token, SECRET).hasPan).toBe(true);
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  it('should round-trip a refresh token', () => {
    const token = signRefreshToken(PAYLOAD.userId, REFRESH_SECRET);
    const decoded = verifyRefreshToken(token, REFRESH_SECRET);
    expect(decoded.userId).toBe(PAYLOAD.userId);
  });

  it('should throw when verified with wrong secret', () => {
    const token = signRefreshToken(PAYLOAD.userId, REFRESH_SECRET);
    expect(() => verifyRefreshToken(token, 'wrong-secret')).toThrow();
  });
});

describe('hashToken', () => {
  it('should return a 64-character hex SHA-256 hash', () => {
    const hash = hashToken('some-token');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('should be deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('should differ for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});
