import { MailSyncService } from '../services/mailbox/mail-sync.service';
import type {
  MailProvider,
  MessageRef,
  ParsedEmail,
  ProviderKey,
} from '../services/mailbox/providers/mail-provider';
import type { EmailParser, ParsedResult } from '../parsers/email-parser';
import { parseKeyRing, encrypt } from '../utils/crypto.utils';
import { sha256Hex } from '../utils/pkce.utils';

export type QueryResult = { rows: Array<Record<string, unknown>> };

export interface MockDb {
  readonly query: jest.Mock<Promise<QueryResult>, [string, unknown[]?]>;
}

export interface Built {
  readonly service: MailSyncService;
  readonly upserts: { readonly apply: jest.Mock };
}

export const ring = parseKeyRing(`1:${'ef'.repeat(32)}`, 1);
export const LOOKBACK_DAYS = 365;
/** The hash a sync stores for its search filter: senders, subject keywords, then the lookback. */
export const searchFilterHash = (parts: readonly string[]): string =>
  sha256Hex([...parts, `lookback:${LOOKBACK_DAYS}`].join(','));
export const HDFC_SENDERS_HASH = searchFilterHash(['@hdfcbank.net']);
export const NOW = new Date('2026-09-26T10:00:00Z');
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SUCCEEDED = "last_sync_status = 'SUCCEEDED'";
export const FAILED = "last_sync_status = 'FAILED'";
export const INITIAL_SINCE = new Date(NOW.getTime() - LOOKBACK_DAYS * DAY_MS);

export const RESULT: ParsedResult = {
  kind: 'CARD_STATEMENT',
  issuingBank: 'HDFC',
  last4: '1234',
  statementDate: '2026-09-05',
  dueDate: '2026-09-25',
  totalDue: 100,
};

export const email = (id: string, subject = 'Statement'): ParsedEmail => ({
  id,
  from: 'statements@hdfcbank.net',
  subject,
  receivedAt: NOW,
  text: '',
  attachments: [],
});

export const connectionRow = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 'mb-1',
  user_id: 'user-1',
  provider: 'GOOGLE',
  status: 'ACTIVE',
  credential_enc: encrypt('rt', ring),
  last_synced_at: null,
  synced_senders_hash: null,
  pan_profile_id: 'pan-1',
  ...overrides,
});

export const makeDb = (row: Record<string, unknown> | null): MockDb => ({
  query: jest.fn(
    async (sql: string, _params?: unknown[]): Promise<QueryResult> => ({
      rows: sql.includes('JOIN pan_profiles') && row ? [row] : [],
    }),
  ),
});

export const refs = (...ids: string[]): (() => AsyncIterable<MessageRef>) =>
  async function* search(): AsyncIterable<MessageRef> {
    for (const id of ids) yield { id };
  };

export const makeProvider = (overrides: Partial<MailProvider> = {}): jest.Mocked<MailProvider> =>
  ({
    key: 'GOOGLE',
    scopes: 's',
    buildAuthUrl: jest.fn(),
    exchangeCode: jest.fn(),
    getAccessToken: jest.fn().mockResolvedValue({ accessToken: 'at', rotatedRefreshToken: null }),
    revoke: jest.fn(),
    search: jest.fn(refs()),
    getMessage: jest.fn(async (_token: string, id: string) => email(id)),
    getAttachment: jest.fn(),
    ...overrides,
  }) as unknown as jest.Mocked<MailProvider>;

export const makeParser = (parse: EmailParser['parse'] = () => RESULT): EmailParser => ({
  key: 'hdfc.cc-statement',
  senders: ['@hdfcbank.net'],
  matches: ({ subject }) => subject === 'Statement',
  parse,
});

export const build = (
  db: MockDb,
  provider: jest.Mocked<MailProvider>,
  parsers: EmailParser[] = [makeParser()],
): Built => {
  const upserts = { apply: jest.fn().mockResolvedValue(undefined) };
  const registry = {
    allSenders: (): string[] => parsers.flatMap((p) => [...p.senders]),
    allSubjectKeywords: (): string[] => parsers.flatMap((p) => [...(p.subjectKeywords ?? [])]),
    find: (meta: { from: string; subject: string }): EmailParser | null =>
      parsers.find((p) => p.matches(meta)) ?? null,
  };
  const service = new MailSyncService({
    db: db as never,
    providers: new Map<ProviderKey, MailProvider>([['GOOGLE', provider]]),
    parsers: registry,
    upserts,
    keyRing: ring,
    now: () => NOW,
  });
  return { service, upserts };
};
