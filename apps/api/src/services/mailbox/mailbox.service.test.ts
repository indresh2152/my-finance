import { AppError } from '../../middleware/error.middleware';
import { encrypt } from '../../utils/crypto.utils';
import {
  CTX,
  MINUTE_MS,
  NOW,
  PAN,
  build,
  errorOf,
  makeDb,
  makeProvider,
  paramsAt,
  ring,
  sqlOf,
  type QueryResponse,
} from '../../test/mailbox-service.fixtures';

const listRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'mb-1',
  provider: 'GOOGLE',
  email_masked: 'us****@gmail.com',
  status: 'ACTIVE',
  last_sync_status: 'SUCCEEDED',
  last_sync_error_code: null,
  last_synced_at: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

describe('MailboxService.resolve', () => {
  it('should return the provider for a supported email', async () => {
    const { service } = build(makeDb([PAN]));
    await expect(service.resolve(CTX, 'user@gmail.com')).resolves.toEqual({
      supported: true,
      provider: 'GOOGLE',
      authType: 'OAUTH',
    });
  });

  it('should report unsupported providers', async () => {
    const { service } = build(makeDb([PAN]), { resolution: { supported: false } });
    await expect(service.resolve(CTX, 'a@yahoo.com')).resolves.toEqual({
      supported: false,
      reason: 'PROVIDER_NOT_SUPPORTED',
    });
  });

  it('should report a provider without a configured OAuth client as unsupported', async () => {
    const { service } = build(makeDb([PAN]), {
      resolution: { supported: true, provider: 'MICROSOFT' },
    });
    await expect(service.resolve(CTX, 'a@outlook.com')).resolves.toEqual({
      supported: false,
      reason: 'PROVIDER_NOT_SUPPORTED',
    });
  });

  it('should reject a mailbox that is already actively linked', async () => {
    const { service } = build(makeDb([PAN, ['email_hash = $2', [{ status: 'ACTIVE' }]]]));
    expect(await errorOf(service.resolve(CTX, 'user@gmail.com'))).toMatchObject({
      code: 'MAILBOX_ALREADY_LINKED',
      status: 409,
    });
  });

  it('should allow re-linking a mailbox that needs re-authorisation', async () => {
    const { service } = build(makeDb([PAN, ['email_hash = $2', [{ status: 'REAUTH_REQUIRED' }]]]));
    await expect(service.resolve(CTX, 'user@gmail.com')).resolves.toMatchObject({
      supported: true,
    });
  });

  it('should require a registered PAN', async () => {
    const { service } = build(makeDb([]));
    expect(await errorOf(service.resolve(CTX, 'user@gmail.com'))).toMatchObject({
      code: 'PAN_NOT_REGISTERED',
      status: 403,
    });
  });
});

describe('MailboxService.startConnect', () => {
  it('should create an OAuth state and return the provider auth URL and the state', async () => {
    const { service, provider, oauthStates } = build(makeDb([PAN]));
    await expect(service.startConnect(CTX, ' User@Gmail.com ')).resolves.toEqual({
      authUrl: 'https://accounts.example/auth',
      state: 'st',
    });
    expect(oauthStates.create).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'GOOGLE',
      loginHint: 'user@gmail.com',
    });
    expect(provider.buildAuthUrl).toHaveBeenCalledWith({
      state: 'st',
      codeChallenge: 'ch',
      loginHint: 'user@gmail.com',
      redirectUri: 'https://app.example/api/v1/mailboxes/oauth/callback/google',
    });
  });

  it('should reject unsupported providers with 422', async () => {
    const { service } = build(makeDb([PAN]), { resolution: { supported: false } });
    const error = await errorOf(service.startConnect(CTX, 'a@yahoo.com'));
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'PROVIDER_NOT_SUPPORTED', status: 422 });
  });

  it('should reject a mailbox that is already actively linked', async () => {
    const { service, oauthStates } = build(
      makeDb([PAN, ['email_hash = $2', [{ status: 'ACTIVE' }]]]),
    );
    expect(await errorOf(service.startConnect(CTX, 'user@gmail.com'))).toMatchObject({
      code: 'MAILBOX_ALREADY_LINKED',
    });
    expect(oauthStates.create).not.toHaveBeenCalled();
  });
});

describe('MailboxService.list', () => {
  it('should return the caller mailboxes in camelCase', async () => {
    const syncedAt = new Date('2026-09-26T08:00:00Z');
    const createdAt = new Date('2026-09-01T08:00:00Z');
    const row = listRow({ last_synced_at: syncedAt, created_at: createdAt, updated_at: syncedAt });
    const { service } = build(makeDb([PAN, ['ORDER BY created_at', [row]]]));
    await expect(service.list(CTX)).resolves.toEqual([
      {
        id: 'mb-1',
        provider: 'GOOGLE',
        emailMasked: 'us****@gmail.com',
        status: 'ACTIVE',
        lastSyncStatus: 'SUCCEEDED',
        lastSyncErrorCode: null,
        lastSyncedAt: syncedAt.toISOString(),
        syncAvailableAt: null,
        createdAt: createdAt.toISOString(),
      },
    ]);
  });

  it('should say when a recently synced mailbox may sync again', async () => {
    const syncedAt = new Date(NOW.getTime() - 2 * MINUTE_MS);
    const row = listRow({ last_synced_at: syncedAt });
    const { service } = build(makeDb([PAN, ['ORDER BY created_at', [row]]]));
    const [summary] = await service.list(CTX);
    expect(summary?.syncAvailableAt).toBe(
      new Date(syncedAt.getTime() + 5 * MINUTE_MS).toISOString(),
    );
  });

  it('should report a sync stuck in RUNNING for over 30 minutes as FAILED', async () => {
    const staleAt = new Date(NOW.getTime() - 31 * MINUTE_MS);
    const row = listRow({ last_sync_status: 'RUNNING', created_at: staleAt, updated_at: staleAt });
    const { service } = build(makeDb([PAN, ['ORDER BY created_at', [row]]]));
    const [summary] = await service.list(CTX);
    expect(summary?.lastSyncStatus).toBe('FAILED');
  });

  it('should keep reporting a recent RUNNING sync as RUNNING', async () => {
    const row = listRow({ last_sync_status: 'RUNNING' });
    const { service } = build(makeDb([PAN, ['ORDER BY created_at', [row]]]));
    const [summary] = await service.list(CTX);
    expect(summary?.lastSyncStatus).toBe('RUNNING');
  });
});

describe('MailboxService.requestSync', () => {
  const owned = (overrides: Record<string, unknown>): QueryResponse => [
    'WHERE id = $1 AND user_id = $2',
    [listRow(overrides)],
  ];

  it('should queue a sync', async () => {
    const { service, enqueueSync } = build(makeDb([PAN, owned({})]));
    await service.requestSync(CTX, 'mb-1');
    expect(enqueueSync).toHaveBeenCalledWith('mb-1');
  });

  it('should return 404 for a mailbox the user does not own', async () => {
    const { service } = build(makeDb([PAN]));
    expect(await errorOf(service.requestSync(CTX, 'mb-x'))).toMatchObject({
      code: 'MAILBOX_NOT_FOUND',
      status: 404,
    });
  });

  it('should return 409 when the mailbox needs re-authorisation', async () => {
    const { service } = build(makeDb([PAN, owned({ status: 'REAUTH_REQUIRED' })]));
    expect(await errorOf(service.requestSync(CTX, 'mb-1'))).toMatchObject({
      code: 'MAILBOX_REAUTH_REQUIRED',
      status: 409,
    });
  });

  it('should return 429 while a sync is running', async () => {
    const { service } = build(makeDb([PAN, owned({ last_sync_status: 'RUNNING' })]));
    expect(await errorOf(service.requestSync(CTX, 'mb-1'))).toMatchObject({
      code: 'SYNC_TOO_FREQUENT',
      status: 429,
    });
  });

  it('should allow a new sync when a RUNNING status is stale', async () => {
    const stale = new Date(NOW.getTime() - 31 * MINUTE_MS);
    const { service, enqueueSync } = build(
      makeDb([PAN, owned({ last_sync_status: 'RUNNING', updated_at: stale })]),
    );
    await service.requestSync(CTX, 'mb-1');
    expect(enqueueSync).toHaveBeenCalledWith('mb-1');
  });

  it('should return 429 within five minutes of the last sync', async () => {
    const recent = new Date(NOW.getTime() - 4 * MINUTE_MS);
    const { service } = build(makeDb([PAN, owned({ last_synced_at: recent })]));
    expect(await errorOf(service.requestSync(CTX, 'mb-1'))).toMatchObject({
      code: 'SYNC_TOO_FREQUENT',
    });
  });
});

describe('MailboxService.unlink', () => {
  const ownedWithCredential: QueryResponse = [
    'WHERE id = $1 AND user_id = $2',
    [{ id: 'mb-1', provider: 'GOOGLE', status: 'ACTIVE', credential_enc: encrypt('rt', ring) }],
  ];

  it('should revoke, delete the mailbox and orphaned EMAIL records in a transaction, then audit', async () => {
    const db = makeDb([PAN, ownedWithCredential]);
    const { service, provider } = build(db);

    await service.unlink(CTX, 'mb-1');

    expect(provider.revoke).toHaveBeenCalledWith('rt');
    const txSql = sqlOf(db.client.query);
    expect(txSql[0]).toBe('BEGIN');
    expect(txSql[1]).toContain('DELETE FROM mail_connections');
    expect(paramsAt(db.client.query, 1)).toEqual(['mb-1', 'user-1']);
    expect(txSql[2]).toContain('DELETE FROM credit_cards');
    expect(txSql[2]).toContain("source = 'EMAIL'");
    expect(paramsAt(db.client.query, 2)).toEqual(['pan-1']);
    expect(txSql[3]).toMatch(/^SAVEPOINT /);
    expect(txSql[4]).toContain('INSERT INTO audit_logs');
    expect(paramsAt(db.client.query, 4)).toEqual(
      expect.arrayContaining(['user-1', 'MAILBOX_UNLINK', 'mail_connection', 'mb-1']),
    );
    expect(txSql[5]).toMatch(/^RELEASE SAVEPOINT /);
    expect(txSql[6]).toBe('COMMIT');
    expect(db.client.release).toHaveBeenCalled();
    expect(sqlOf(db.query).some((sql) => sql.includes('INSERT INTO audit_logs'))).toBe(false);
  });

  it('should keep the deletes and commit when the audit write aborts the transaction', async () => {
    const db = makeDb([PAN, ownedWithCredential]);
    db.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO audit_logs')) throw new Error('invalid inet');
      if (sql.startsWith('RELEASE SAVEPOINT')) throw new Error('current transaction is aborted');
      return { rows: [] };
    });
    const { service } = build(db);
    await expect(service.unlink(CTX, 'mb-1')).resolves.toBeUndefined();
    const txSql = sqlOf(db.client.query);
    expect(txSql.slice(-2)).toEqual([expect.stringMatching(/^ROLLBACK TO SAVEPOINT /), 'COMMIT']);
    expect(txSql).not.toContain('ROLLBACK');
  });

  it('should still delete locally when provider revoke fails', async () => {
    const provider = makeProvider({ revoke: jest.fn().mockRejectedValue(new Error('network')) });
    const db = makeDb([PAN, ownedWithCredential]);
    const { service } = build(db, { provider });
    await service.unlink(CTX, 'mb-1');
    expect(sqlOf(db.client.query)).toContain('COMMIT');
  });

  it('should roll back when a delete fails', async () => {
    const db = makeDb([PAN, ownedWithCredential]);
    db.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE FROM credit_cards')) throw new Error('boom');
      return { rows: [] };
    });
    const { service } = build(db);
    await expect(service.unlink(CTX, 'mb-1')).rejects.toThrow('boom');
    expect(sqlOf(db.client.query)).toContain('ROLLBACK');
    expect(db.client.release).toHaveBeenCalled();
  });

  it('should surface the original error when the rollback itself fails', async () => {
    const db = makeDb([PAN, ownedWithCredential]);
    db.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE FROM credit_cards')) throw new Error('boom');
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
      return { rows: [] };
    });
    const { service } = build(db);
    await expect(service.unlink(CTX, 'mb-1')).rejects.toThrow('boom');
    expect(db.client.release).toHaveBeenCalled();
  });

  it('should return 404 for a mailbox the user does not own', async () => {
    const { service } = build(makeDb([PAN]));
    expect(await errorOf(service.unlink(CTX, 'mb-x'))).toMatchObject({
      code: 'MAILBOX_NOT_FOUND',
    });
  });
});
