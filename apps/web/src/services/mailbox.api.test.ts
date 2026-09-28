import { AxiosError, AxiosHeaders } from 'axios';
import {
  apiErrorCode,
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
