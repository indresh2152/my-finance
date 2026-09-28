import { MailboxService, type RequestContext } from '../services/mailbox/mailbox.service';
import type { MailProvider, ProviderKey } from '../services/mailbox/providers/mail-provider';
import type { PendingOAuth } from '../services/mailbox/oauth-state.service';
import type { Resolution } from '../services/mailbox/provider-resolver';
import { parseKeyRing, type KeyRing } from '../utils/crypto.utils';

export type Rows = Array<Record<string, unknown>>;
export type QueryResponse = [fragment: string, rows: Rows];
type QueryResult = { rows: Rows; rowCount: number };

export const ring: KeyRing = parseKeyRing(`1:${'cd'.repeat(32)}`, 1);
export const HMAC_SECRET = 'h'.repeat(32);
export const NOW = new Date('2026-09-26T10:00:00Z');
export const MINUTE_MS = 60 * 1000;
export const CTX: RequestContext = { userId: 'user-1', lng: 'en', ip: '127.0.0.1' };
export const PAN: QueryResponse = ['FROM pan_profiles', [{ id: 'pan-1' }]];
export const PENDING: PendingOAuth = {
  userId: 'user-1',
  provider: 'GOOGLE',
  loginHint: 'user@gmail.com',
  codeVerifier: 'v',
};

export interface MockClient {
  readonly query: jest.Mock;
  readonly release: jest.Mock;
}

export interface MockDb {
  readonly query: jest.Mock<Promise<QueryResult>, [string, unknown[]?]>;
  readonly connect: jest.Mock;
  readonly client: MockClient;
}

/** A pool whose `query` answers with the rows of the first response whose fragment the SQL contains. */
export const makeDb = (responses: QueryResponse[]): MockDb => {
  const client: MockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  const query = jest.fn(async (sql: string, _params?: unknown[]): Promise<QueryResult> => {
    const match = responses.find(([fragment]) => sql.includes(fragment));
    const rows = match ? match[1] : [];
    return { rows, rowCount: rows.length };
  });
  return { query, connect: jest.fn().mockResolvedValue(client), client };
};

export const makeProvider = (overrides: Partial<MailProvider> = {}): jest.Mocked<MailProvider> =>
  ({
    key: 'GOOGLE',
    scopes: 'gmail-scope',
    buildAuthUrl: jest.fn().mockReturnValue('https://accounts.example/auth'),
    exchangeCode: jest
      .fn()
      .mockResolvedValue({ refreshToken: 'rt', accountEmail: 'User@Gmail.com' }),
    getAccessToken: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
    search: jest.fn(),
    getMessage: jest.fn(),
    getAttachment: jest.fn(),
    ...overrides,
  }) as unknown as jest.Mocked<MailProvider>;

export interface BuildOptions {
  readonly resolution?: Resolution;
  readonly pending?: PendingOAuth | null;
  readonly provider?: jest.Mocked<MailProvider>;
}

export interface Built {
  readonly service: MailboxService;
  readonly provider: jest.Mocked<MailProvider>;
  readonly enqueueSync: jest.Mock;
  readonly oauthStates: { readonly create: jest.Mock; readonly consume: jest.Mock };
}

export const build = (db: MockDb, opts: BuildOptions = {}): Built => {
  const provider = opts.provider ?? makeProvider();
  const enqueueSync = jest.fn().mockResolvedValue(undefined);
  const oauthStates = {
    create: jest.fn().mockResolvedValue({ state: 'st', codeChallenge: 'ch' }),
    consume: jest.fn().mockResolvedValue(opts.pending === undefined ? PENDING : opts.pending),
  };
  const resolution: Resolution = opts.resolution ?? { supported: true, provider: 'GOOGLE' };
  const service = new MailboxService({
    db: db as never,
    providers: new Map<ProviderKey, MailProvider>([['GOOGLE', provider]]),
    resolver: { resolve: jest.fn().mockResolvedValue(resolution) },
    oauthStates,
    keyRing: ring,
    emailHmacSecret: HMAC_SECRET,
    appBaseUrl: 'https://app.example',
    enqueueSync,
    now: () => NOW,
  });
  return { service, provider, enqueueSync, oauthStates };
};

export const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.catch((err: unknown) => err);

/** Params of the first `query` call whose SQL contains `fragment`; throws when there is none. */
export const paramsWhere = (mock: jest.Mock, fragment: string): unknown[] => {
  const calls = mock.mock.calls as Array<[string, unknown[]?]>;
  const call = calls.find(([sql]) => sql.includes(fragment));
  if (!call) throw new Error(`no query containing "${fragment}" was recorded`);
  return call[1] ?? [];
};

/** Params of the `query` call at `index`; throws when that call was not recorded. */
export const paramsAt = (mock: jest.Mock, index: number): unknown[] => {
  const call = mock.mock.calls[index] as [string, unknown[]?] | undefined;
  if (!call) throw new Error(`query call ${index} was not recorded`);
  return call[1] ?? [];
};

export const sqlOf = (mock: jest.Mock): string[] =>
  (mock.mock.calls as Array<[string, unknown[]?]>).map(([sql]) => sql);
