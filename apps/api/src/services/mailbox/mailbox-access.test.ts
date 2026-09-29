import { obtainAccess } from './mailbox-access';
import { decrypt, encrypt } from '../../utils/crypto.utils';
import { makeProvider, ring } from '../../test/mailbox-service.fixtures';
import type { MailProvider } from './providers/mail-provider';

const providerReturning = (rotated: string | null): MailProvider =>
  makeProvider({
    getAccessToken: jest
      .fn()
      .mockResolvedValue({ accessToken: 'at', rotatedRefreshToken: rotated }),
  });

const connection = { id: 'mb-1', credential_enc: encrypt('refresh-1', ring) };

describe('obtainAccess', () => {
  it('should exchange the stored refresh token without writing when it is not rotated', async () => {
    const db = { query: jest.fn() };
    const provider = providerReturning(null);

    const grant = await obtainAccess({ db, keyRing: ring }, provider, connection);

    expect(grant.accessToken).toBe('at');
    expect(provider.getAccessToken).toHaveBeenCalledWith('refresh-1');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('should save a rotated refresh token encrypted', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await obtainAccess({ db, keyRing: ring }, providerReturning('refresh-2'), connection);

    const [sql, params] = db.query.mock.calls[0] as [string, [string, Buffer, number]];
    expect(sql).toContain('UPDATE mail_connections SET credential_enc');
    expect(params[0]).toBe('mb-1');
    expect(decrypt(params[1], ring)).toBe('refresh-2');
    expect(params[2]).toBe(ring.activeVersion);
  });
});
