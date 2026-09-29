import { AxiosError, AxiosHeaders } from 'axios';
import {
  apiErrorCode,
  gatheringMailboxIds,
  isGathering,
  mailboxPollInterval,
  SYNC_POLL_INTERVAL_MS,
  type Mailbox,
} from './mailbox.api';

const mailbox = (lastSyncStatus: Mailbox['lastSyncStatus']): Mailbox => ({
  id: 'mb-1',
  provider: 'GOOGLE',
  emailMasked: 'us****@gmail.com',
  status: 'ACTIVE',
  lastSyncStatus,
  lastSyncErrorCode: null,
  lastSyncedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
});

const REQUESTED_AT = Date.parse('2026-09-29T10:00:00Z');
const BEFORE_REQUEST = '2026-09-29T09:59:00Z';
const AFTER_REQUEST = '2026-09-29T10:00:05Z';

const synced = (overrides: Partial<Mailbox> = {}): Mailbox => ({
  ...mailbox('SUCCEEDED'),
  lastSyncedAt: BEFORE_REQUEST,
  ...overrides,
});

describe('mailboxPollInterval', () => {
  it('should poll while any mailbox is syncing', () => {
    expect(mailboxPollInterval([mailbox('SUCCEEDED'), mailbox('RUNNING')], 0, 1000)).toBe(
      SYNC_POLL_INTERVAL_MS,
    );
  });

  it('should poll until the post-action window ends', () => {
    expect(mailboxPollInterval([mailbox('SUCCEEDED')], 5000, 1000)).toBe(SYNC_POLL_INTERVAL_MS);
    expect(mailboxPollInterval([mailbox('SUCCEEDED')], 5000, 6000)).toBe(false);
  });

  it('should not poll without data or activity', () => {
    expect(mailboxPollInterval(undefined, 0, 1000)).toBe(false);
  });

  it('should poll while a mailbox has never finished a sync', () => {
    expect(mailboxPollInterval([mailbox('NEVER')], 0, 1000)).toBe(SYNC_POLL_INTERVAL_MS);
  });
});

describe('isGathering', () => {
  it('should be gathering before the first sync finishes and while a sync runs', () => {
    expect(isGathering(mailbox('NEVER'))).toBe(true);
    expect(isGathering(mailbox('RUNNING'))).toBe(true);
  });

  it('should not be gathering after a sync with no outstanding request', () => {
    expect(isGathering(synced())).toBe(false);
  });

  it('should be gathering until a sync starts after the refresh request', () => {
    expect(isGathering(synced(), REQUESTED_AT)).toBe(true);
    expect(isGathering(synced({ lastSyncedAt: null }), REQUESTED_AT)).toBe(true);
    expect(isGathering(synced({ lastSyncedAt: AFTER_REQUEST }), REQUESTED_AT)).toBe(false);
  });

  it('should not be gathering when the sync failed or access expired', () => {
    expect(isGathering(synced({ lastSyncStatus: 'FAILED' }), REQUESTED_AT)).toBe(false);
    expect(isGathering(synced({ status: 'REAUTH_REQUIRED' }), REQUESTED_AT)).toBe(false);
    expect(isGathering({ ...mailbox('RUNNING'), status: 'REAUTH_REQUIRED' })).toBe(false);
  });
});

describe('gatheringMailboxIds', () => {
  const requests = { 'mb-1': REQUESTED_AT };

  it('should count refresh requests only while the poll window is open', () => {
    expect(gatheringMailboxIds([synced()], requests, REQUESTED_AT + 1000, REQUESTED_AT)).toEqual(
      new Set(['mb-1']),
    );
    expect(gatheringMailboxIds([synced()], requests, REQUESTED_AT, REQUESTED_AT + 1000)).toEqual(
      new Set(),
    );
  });

  it('should include running mailboxes regardless of the window', () => {
    const running = { ...mailbox('RUNNING'), id: 'mb-2' };
    expect(gatheringMailboxIds([synced(), running], {}, 0, REQUESTED_AT)).toEqual(
      new Set(['mb-2']),
    );
  });

  it('should be empty without data', () => {
    expect(gatheringMailboxIds(undefined, requests, REQUESTED_AT + 1000, REQUESTED_AT)).toEqual(
      new Set(),
    );
  });
});

describe('apiErrorCode', () => {
  it('should read the API error code from an axios error', () => {
    const error = new AxiosError('x', '409', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { error: { code: 'MAILBOX_ALREADY_LINKED' } },
    });
    expect(apiErrorCode(error)).toBe('MAILBOX_ALREADY_LINKED');
  });

  it('should return null for axios errors without a code and for other errors', () => {
    expect(apiErrorCode(new AxiosError('network'))).toBeNull();
    expect(apiErrorCode(new Error('x'))).toBeNull();
  });
});
