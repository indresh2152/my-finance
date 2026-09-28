import { MailboxLinkError, type CallbackInput } from './mailbox.service';
import type { PendingOAuth } from './oauth-state.service';
import { decrypt } from '../../utils/crypto.utils';
import { hashEmail } from '../../utils/email.utils';
import {
  HMAC_SECRET,
  PENDING,
  build,
  errorOf,
  makeDb,
  makeProvider,
  paramsWhere,
  ring,
  sqlOf,
} from '../../test/mailbox-service.fixtures';

const CALLBACK: CallbackInput = {
  provider: 'GOOGLE',
  code: 'code',
  state: 'st',
  browserState: 'st',
};
const INSERTED: [string, Array<Record<string, unknown>>] = [
  'INSERT INTO mail_connections',
  [{ id: 'mb-1' }],
];
const REDIRECT_URI = 'https://app.example/api/v1/mailboxes/oauth/callback/google';

describe('MailboxService.completeConnect', () => {
  it('should store the encrypted credential, queue a sync and audit the link', async () => {
    const db = makeDb([INSERTED]);
    const { service, provider, enqueueSync } = build(db);

    await expect(service.completeConnect(CALLBACK)).resolves.toEqual({
      userId: 'user-1',
      mailboxId: 'mb-1',
    });

    expect(provider.exchangeCode).toHaveBeenCalledWith({
      code: 'code',
      codeVerifier: 'v',
      redirectUri: REDIRECT_URI,
    });
    const params = paramsWhere(db.query, 'INSERT INTO mail_connections');
    expect(params.slice(0, 4)).toEqual([
      'user-1',
      'GOOGLE',
      hashEmail('user@gmail.com', HMAC_SECRET),
      'us****@gmail.com',
    ]);
    expect(decrypt(params[4] as Buffer, ring)).toBe('rt');
    expect(params.slice(5)).toEqual([1, 'gmail-scope']);
    expect(enqueueSync).toHaveBeenCalledWith('mb-1');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['user-1', 'MAILBOX_LINK', 'mail_connection', 'mb-1']),
    );
  });

  it('should still succeed when queueing the first sync fails', async () => {
    const { service, enqueueSync } = build(makeDb([INSERTED]));
    enqueueSync.mockRejectedValueOnce(new Error('queue down'));
    await expect(service.completeConnect(CALLBACK)).resolves.toEqual({
      userId: 'user-1',
      mailboxId: 'mb-1',
    });
  });

  it.each<[string, CallbackInput, PendingOAuth | null | undefined]>([
    ['a missing state', { ...CALLBACK, state: undefined }, undefined],
    [
      'a missing browser cookie (callback opened in another browser)',
      { ...CALLBACK, browserState: undefined },
      undefined,
    ],
    [
      'a browser cookie that does not match the state',
      { ...CALLBACK, browserState: 'other' },
      undefined,
    ],
    ['an unknown or expired state', CALLBACK, null],
    ['a provider different from the stored one', { ...CALLBACK, provider: 'MICROSOFT' }, undefined],
    ['a missing code', { ...CALLBACK, code: undefined }, undefined],
    ['an unrecognised provider error', { ...CALLBACK, error: 'server_error' }, undefined],
  ])('should fail with MAILBOX_LINK_FAILED for %s', async (_label, input, pending) => {
    const { service } = build(makeDb([]), { pending });
    expect(await errorOf(service.completeConnect(input))).toEqual(
      new MailboxLinkError('MAILBOX_LINK_FAILED'),
    );
  });

  it('should not consume the state when the browser cookie does not match', async () => {
    const { service, oauthStates } = build(makeDb([]));
    await errorOf(service.completeConnect({ ...CALLBACK, browserState: 'other' }));
    expect(oauthStates.consume).not.toHaveBeenCalled();
  });

  it('should accept a googlemail.com login that Google reports as gmail.com', async () => {
    const provider = makeProvider({
      exchangeCode: jest
        .fn()
        .mockResolvedValue({ refreshToken: 'rt', accountEmail: 'user@gmail.com' }),
    });
    const db = makeDb([INSERTED]);
    const { service } = build(db, {
      provider,
      pending: { ...PENDING, loginHint: 'user@googlemail.com' },
    });
    await expect(service.completeConnect(CALLBACK)).resolves.toEqual({
      userId: 'user-1',
      mailboxId: 'mb-1',
    });
    // One hash per mailbox, whichever alias was typed; the mask keeps the address as typed.
    const params = paramsWhere(db.query, 'INSERT INTO mail_connections');
    expect(params.slice(2, 4)).toEqual([
      hashEmail('user@gmail.com', HMAC_SECRET),
      'us****@googlemail.com',
    ]);
  });

  it('should map access_denied to MAILBOX_ACCESS_DENIED', async () => {
    const { service } = build(makeDb([]));
    const error = await errorOf(service.completeConnect({ ...CALLBACK, error: 'access_denied' }));
    expect(error).toMatchObject({ code: 'MAILBOX_ACCESS_DENIED' });
  });

  it.each([
    ['an Entra AADSTS65001 description', 'access_denied', 'AADSTS65001: consent needed'],
    ['a consent_required error', 'consent_required', undefined],
  ])('should map %s to MAILBOX_ADMIN_CONSENT_REQUIRED', async (_label, error, description) => {
    const { service } = build(makeDb([]));
    const result = await errorOf(
      service.completeConnect({ ...CALLBACK, error, errorDescription: description }),
    );
    expect(result).toMatchObject({ code: 'MAILBOX_ADMIN_CONSENT_REQUIRED' });
  });

  it('should fail with MAILBOX_LINK_FAILED when the code exchange fails', async () => {
    const provider = makeProvider({
      exchangeCode: jest.fn().mockRejectedValue(new Error('bad code')),
    });
    const { service } = build(makeDb([]), { provider });
    expect(await errorOf(service.completeConnect(CALLBACK))).toMatchObject({
      code: 'MAILBOX_LINK_FAILED',
    });
  });

  it('should fail with MAILBOX_LINK_FAILED when the exchange rejects with a non-Error', async () => {
    const provider = makeProvider({ exchangeCode: jest.fn().mockRejectedValue('nope') });
    const { service } = build(makeDb([]), { provider });
    expect(await errorOf(service.completeConnect(CALLBACK))).toMatchObject({
      code: 'MAILBOX_LINK_FAILED',
    });
  });

  it('should revoke and reject when the user signs in with a different account', async () => {
    const provider = makeProvider({
      exchangeCode: jest
        .fn()
        .mockResolvedValue({ refreshToken: 'rt', accountEmail: 'other@gmail.com' }),
    });
    const db = makeDb([]);
    const { service } = build(db, { provider });
    expect(await errorOf(service.completeConnect(CALLBACK))).toMatchObject({
      code: 'MAILBOX_EMAIL_MISMATCH',
    });
    expect(provider.revoke).toHaveBeenCalledWith('rt');
    expect(sqlOf(db.query).some((sql) => sql.includes('INSERT INTO mail_connections'))).toBe(false);
  });

  it('should fail loudly and revoke the new grant when the upsert returns no row', async () => {
    const { service, provider } = build(makeDb([]));
    await expect(service.completeConnect(CALLBACK)).rejects.toThrow('mail_connections upsert');
    expect(provider.revoke).toHaveBeenCalledWith('rt');
  });

  it('should revoke the new grant and rethrow when storing the connection fails', async () => {
    const db = makeDb([]);
    db.query.mockRejectedValueOnce(new Error('db down'));
    const { service, provider, enqueueSync } = build(db);
    await expect(service.completeConnect(CALLBACK)).rejects.toThrow('db down');
    expect(provider.revoke).toHaveBeenCalledWith('rt');
    expect(enqueueSync).not.toHaveBeenCalled();
  });

  it('should still rethrow the storage error when the revoke also fails', async () => {
    const provider = makeProvider({ revoke: jest.fn().mockRejectedValue(new Error('network')) });
    const db = makeDb([]);
    db.query.mockRejectedValueOnce(new Error('db down'));
    const { service } = build(db, { provider });
    await expect(service.completeConnect(CALLBACK)).rejects.toThrow('db down');
  });
});
