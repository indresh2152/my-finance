import crypto from 'crypto';
import { randomToken, createPkcePair, sha256Hex } from './pkce.utils';

describe('pkce utils', () => {
  it('should create url-safe random tokens', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });

  it('should derive the S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkcePair();
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('should hash to 64 hex chars', () => {
    expect(sha256Hex('state')).toMatch(/^[0-9a-f]{64}$/);
  });
});
