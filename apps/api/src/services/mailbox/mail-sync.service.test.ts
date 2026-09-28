const mockLogger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('pino', () => jest.fn(() => mockLogger));

import {
  ProviderNotFoundError,
  ProviderRequestError,
  ReauthRequiredError,
} from './providers/mail-provider';
import type { EmailParser } from '../../parsers/email-parser';
import { decrypt } from '../../utils/crypto.utils';
import { sha256Hex } from '../../utils/pkce.utils';
import { paramsWhere, sqlOf } from '../../test/mailbox-service.fixtures';
import {
  DAY_MS,
  FAILED,
  HDFC_SENDERS_HASH,
  INITIAL_SINCE,
  NOW,
  RESULT,
  SUCCEEDED,
  build,
  connectionRow,
  email,
  makeDb,
  makeParser,
  makeProvider,
  refs,
  ring,
} from '../../test/mail-sync-service.fixtures';

afterEach(() => jest.clearAllMocks());

describe('MailSyncService.syncMailbox', () => {
  it('should skip unknown or inactive mailboxes', async () => {
    const provider = makeProvider();
    await expect(build(makeDb(null), provider).service.syncMailbox('mb-x')).resolves.toBeNull();
    await expect(
      build(makeDb(connectionRow({ status: 'REAUTH_REQUIRED' })), provider).service.syncMailbox(
        'mb-1',
      ),
    ).resolves.toBeNull();
    expect(provider.getAccessToken).not.toHaveBeenCalled();
  });

  it('should search 180 days back on the first sync and upsert parsed results', async () => {
    const provider = makeProvider({ search: jest.fn(refs('m1', 'm2')) });
    const db = makeDb(connectionRow());
    const { service, upserts } = build(db, provider);

    await expect(service.syncMailbox('mb-1')).resolves.toEqual({
      scanned: 2,
      parsed: 2,
      skipped: 0,
    });

    expect(provider.getAccessToken).toHaveBeenCalledWith('rt');
    expect(provider.search).toHaveBeenCalledWith('at', {
      senders: ['@hdfcbank.net'],
      since: INITIAL_SINCE,
    });
    expect(upserts.apply).toHaveBeenCalledWith('pan-1', 'mb-1', RESULT, 'm1');
    expect(sqlOf(db.query).some((s) => s.includes("last_sync_status = 'RUNNING'"))).toBe(true);
    expect(paramsWhere(db.query, SUCCEEDED)).toEqual(['mb-1', NOW, HDFC_SENDERS_HASH]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining([
        'user-1',
        'MAILBOX_SYNC',
        JSON.stringify({ provider: 'GOOGLE', scanned: 2, parsed: 2, skipped: 0 }),
      ]),
    );
  });

  it('should search from one day before the last sync on later runs', async () => {
    const lastSynced = new Date('2026-09-20T00:00:00Z');
    const provider = makeProvider();
    const row = connectionRow({
      last_synced_at: lastSynced,
      synced_senders_hash: HDFC_SENDERS_HASH,
    });
    await build(makeDb(row), provider).service.syncMailbox('mb-1');
    expect(provider.search).toHaveBeenCalledWith('at', {
      senders: ['@hdfcbank.net'],
      since: new Date(lastSynced.getTime() - DAY_MS),
    });
  });

  it('should rescan 180 days when the parser sender set has changed since the last sync', async () => {
    const provider = makeProvider();
    const row = connectionRow({
      last_synced_at: new Date('2026-09-20T00:00:00Z'),
      synced_senders_hash: sha256Hex(''),
    });
    await build(makeDb(row), provider).service.syncMailbox('mb-1');
    expect(provider.search).toHaveBeenCalledWith('at', {
      senders: ['@hdfcbank.net'],
      since: INITIAL_SINCE,
    });
  });

  it('should hash the senders in sorted order', async () => {
    const provider = makeProvider();
    const db = makeDb(connectionRow());
    const second: EmailParser = { ...makeParser(), key: 'axis', senders: ['@axisbank.com'] };
    await build(db, provider, [makeParser(), second]).service.syncMailbox('mb-1');
    expect(provider.search).toHaveBeenCalledWith('at', {
      senders: ['@axisbank.com', '@hdfcbank.net'],
      since: INITIAL_SINCE,
    });
    expect(paramsWhere(db.query, SUCCEEDED)[2]).toBe(sha256Hex('@axisbank.com,@hdfcbank.net'));
  });

  it('should skip duplicates, unmatched emails, null results, parser crashes and deleted messages', async () => {
    const provider = makeProvider({
      search: jest.fn(refs('m1', 'm1', 'otp', 'null', 'crash', 'gone')),
      getMessage: jest.fn(async (_t: string, id: string) => {
        if (id === 'gone') throw new ProviderNotFoundError('GOOGLE');
        return email(id, id === 'otp' ? 'OTP' : 'Statement');
      }),
    });
    const parser = makeParser((msg) => {
      if (msg.id === 'crash') throw new Error('bad template');
      return msg.id === 'null' ? null : RESULT;
    });
    const { service, upserts } = build(makeDb(connectionRow()), provider, [parser]);

    await expect(service.syncMailbox('mb-1')).resolves.toEqual({
      scanned: 5,
      parsed: 1,
      skipped: 4,
    });
    expect(upserts.apply).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ parserKey: 'hdfc.cc-statement', messageId: 'crash' }),
      expect.any(String),
    );
  });

  it('should record SYNC_ERROR and rethrow when fetching a message fails unexpectedly', async () => {
    const provider = makeProvider({
      search: jest.fn(refs('m1')),
      getMessage: jest.fn().mockRejectedValue('socket closed'),
    });
    const db = makeDb(connectionRow());
    await expect(build(db, provider).service.syncMailbox('mb-1')).rejects.toBe('socket closed');
    expect(paramsWhere(db.query, FAILED)).toEqual(['mb-1', 'SYNC_ERROR']);
  });

  it('should not search when no parsers are registered', async () => {
    const provider = makeProvider();
    const db = makeDb(connectionRow());
    await expect(build(db, provider, []).service.syncMailbox('mb-1')).resolves.toEqual({
      scanned: 0,
      parsed: 0,
      skipped: 0,
    });
    expect(provider.search).not.toHaveBeenCalled();
    expect(paramsWhere(db.query, SUCCEEDED)).toEqual(['mb-1', NOW, sha256Hex('')]);
  });

  it('should persist a rotated refresh token', async () => {
    const provider = makeProvider({
      getAccessToken: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at', rotatedRefreshToken: 'rt-2' }),
    });
    const db = makeDb(connectionRow());
    await build(db, provider, []).service.syncMailbox('mb-1');
    const params = paramsWhere(db.query, 'SET credential_enc');
    expect(decrypt(params[1] as Buffer, ring)).toBe('rt-2');
    expect(params[2]).toBe(1);
  });

  it('should mark the mailbox REAUTH_REQUIRED and not rethrow when the grant is revoked', async () => {
    const provider = makeProvider({
      getAccessToken: jest.fn().mockRejectedValue(new ReauthRequiredError('GOOGLE')),
    });
    const db = makeDb(connectionRow());
    await expect(build(db, provider).service.syncMailbox('mb-1')).resolves.toBeNull();
    expect(sqlOf(db.query).some((s) => s.includes("status = 'REAUTH_REQUIRED'"))).toBe(true);
  });

  it('should record PROVIDER_ERROR and rethrow so pg-boss retries', async () => {
    const provider = makeProvider({
      getAccessToken: jest.fn().mockRejectedValue(new ProviderRequestError('GOOGLE', 503, 'x')),
    });
    const db = makeDb(connectionRow());
    await expect(build(db, provider).service.syncMailbox('mb-1')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expect(paramsWhere(db.query, FAILED)).toEqual(['mb-1', 'PROVIDER_ERROR']);
  });

  it('should record SYNC_ERROR for unexpected failures', async () => {
    const provider = makeProvider({ search: jest.fn(refs('m1')) });
    const db = makeDb(connectionRow());
    const { service, upserts } = build(db, provider);
    upserts.apply.mockRejectedValueOnce(new Error('db down'));
    await expect(service.syncMailbox('mb-1')).rejects.toThrow('db down');
    expect(paramsWhere(db.query, FAILED)).toEqual(['mb-1', 'SYNC_ERROR']);
  });
});
