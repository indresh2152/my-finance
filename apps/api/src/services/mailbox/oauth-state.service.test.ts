import { OAuthStateService } from './oauth-state.service';
import { parseKeyRing, encrypt } from '../../utils/crypto.utils';
import { sha256Hex } from '../../utils/pkce.utils';

const ring = parseKeyRing(`1:${'ab'.repeat(32)}`, 1);
const NOW = new Date('2026-09-26T10:00:00Z');
const TEN_MINUTES_MS = 10 * 60 * 1000;

const firstCall = (db: { query: jest.Mock }): [string, unknown[]] => {
  const call = db.query.mock.calls[0] as [string, unknown[]] | undefined;
  if (!call) throw new Error('db.query was not called');
  return call;
};

describe('OAuthStateService.create', () => {
  it('should store a hashed state with encrypted hint and verifier, expiring in 10 minutes', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new OAuthStateService(db, ring, () => NOW);

    const { state, codeChallenge } = await service.create({
      userId: 'u1',
      provider: 'GOOGLE',
      loginHint: 'a@gmail.com',
    });

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [sql, params] = firstCall(db);
    expect(sql).toContain('INSERT INTO oauth_states');
    expect(params[0]).toBe(sha256Hex(state));
    expect(params[1]).toBe('u1');
    expect(params[2]).toBe('GOOGLE');
    expect(Buffer.isBuffer(params[3])).toBe(true);
    expect(params[5]).toEqual(new Date(NOW.getTime() + TEN_MINUTES_MS));
  });
});

describe('OAuthStateService.consume', () => {
  const row = (expiresAt: Date): Record<string, unknown> => ({
    user_id: 'u1',
    provider: 'MICROSOFT',
    login_hint_enc: encrypt('a@outlook.com', ring),
    code_verifier_enc: encrypt('verifier', ring),
    expires_at: expiresAt,
  });

  it('should delete the state and return the decrypted pending request', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [row(new Date(NOW.getTime() + 1000))] }),
    };
    const service = new OAuthStateService(db, ring, () => NOW);

    await expect(service.consume('the-state')).resolves.toEqual({
      userId: 'u1',
      provider: 'MICROSOFT',
      loginHint: 'a@outlook.com',
      codeVerifier: 'verifier',
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM oauth_states'), [
      sha256Hex('the-state'),
    ]);
  });

  it('should return null for an unknown state', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await expect(new OAuthStateService(db, ring, () => NOW).consume('x')).resolves.toBeNull();
  });

  it('should return null for an expired state', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [row(new Date(NOW.getTime() - 1))] }) };
    await expect(new OAuthStateService(db, ring, () => NOW).consume('x')).resolves.toBeNull();
  });
});
