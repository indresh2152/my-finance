import type { Mailbox } from '../services/mailbox.api';

/** A linked, synced Google mailbox; override what a test needs. */
export const mailbox = (overrides: Partial<Mailbox> = {}): Mailbox => ({
  id: 'mb-1',
  provider: 'GOOGLE',
  emailMasked: 'us****@gmail.com',
  status: 'ACTIVE',
  lastSyncStatus: 'SUCCEEDED',
  lastSyncErrorCode: null,
  lastSyncedAt: '2026-09-26T08:00:00Z',
  syncAvailableAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  ...overrides,
});
