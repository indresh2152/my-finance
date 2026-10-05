import axios from 'axios';
import apiClient from './api';

export type ProviderKey = 'GOOGLE' | 'MICROSOFT';

export interface Mailbox {
  id: string;
  provider: ProviderKey;
  emailMasked: string;
  status: 'ACTIVE' | 'REAUTH_REQUIRED';
  lastSyncStatus: 'NEVER' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  lastSyncErrorCode: string | null;
  lastSyncedAt: string | null;
  /** When a manual sync is allowed again (the server's cooldown); null when it is allowed now. */
  syncAvailableAt: string | null;
  createdAt: string;
}

/** True when the server will accept a manual sync for this mailbox now. */
export const isSyncAvailable = (mailbox: Mailbox, now: number): boolean =>
  mailbox.syncAvailableAt === null || Date.parse(mailbox.syncAvailableAt) <= now;

/** The next time a mailbox's sync cooldown ends, so the UI can re-enable Refresh then. */
export const nextSyncAvailableAt = (
  mailboxes: readonly Mailbox[] | undefined,
  now: number,
): number | null => {
  const upcoming = (mailboxes ?? [])
    .map((mailbox) => (mailbox.syncAvailableAt === null ? 0 : Date.parse(mailbox.syncAvailableAt)))
    .filter((availableAt) => availableAt > now);
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
};

export type ResolveResult =
  | { supported: true; provider: ProviderKey; authType: 'OAUTH' }
  | { supported: false; reason: 'PROVIDER_NOT_SUPPORTED' };

export const MAILBOXES_QUERY_KEY = ['mailboxes'] as const;
export const SYNC_POLL_INTERVAL_MS = 3000;
/** After linking or requesting a sync, keep polling this long so the queued job's progress shows up. */
export const POST_ACTION_POLL_MS = 60_000;

export const listMailboxes = async (): Promise<Mailbox[]> =>
  (await apiClient.get<{ mailboxes: Mailbox[] }>('/mailboxes')).data.mailboxes;

export const resolveMailbox = async (email: string): Promise<ResolveResult> =>
  (await apiClient.post<ResolveResult>('/mailboxes/resolve', { email })).data;

export const connectMailbox = async (email: string): Promise<string> =>
  (await apiClient.post<{ authUrl: string }>('/mailboxes/connect', { email })).data.authUrl;

export const syncMailbox = async (mailboxId: string): Promise<void> => {
  await apiClient.post(`/mailboxes/${mailboxId}/sync`);
};

export const unlinkMailbox = async (mailboxId: string): Promise<void> => {
  await apiClient.delete(`/mailboxes/${mailboxId}`);
};

export const apiErrorCode = (err: unknown): string | null => {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as { error?: { code?: string } } | undefined;
  return data?.error?.code ?? null;
};

/** When (epoch ms) the user asked each mailbox to sync, keyed by mailbox id. */
export type SyncRequests = Readonly<Record<string, number>>;

/** Matches the server's stale-RUNNING cutoff: a first sync not started by then is not coming (e.g. worker down). */
export const FIRST_SYNC_LIMIT_MS = 30 * 60 * 1000;

const firstSyncDeadline = (mailbox: Mailbox): number =>
  Date.parse(mailbox.createdAt) + FIRST_SYNC_LIMIT_MS;

/**
 * True while card and account details are still being gathered from this mailbox. A refresh at
 * `requestedAt` is pending until a sync starts after it (the worker stamps its start time in
 * lastSyncedAt); callers bound it with the poll window, which also covers a sync that fails.
 */
export const isGathering = (mailbox: Mailbox, now: number, requestedAt?: number): boolean => {
  if (mailbox.status !== 'ACTIVE') return false;
  if (mailbox.lastSyncStatus === 'RUNNING') return true;
  if (mailbox.lastSyncStatus === 'NEVER' && now < firstSyncDeadline(mailbox)) return true;
  return (
    requestedAt !== undefined &&
    (mailbox.lastSyncedAt === null || Date.parse(mailbox.lastSyncedAt) < requestedAt)
  );
};

/** Refresh requests count only inside the poll window, so neither clock drift nor a failed sync can pin a mailbox as gathering. */
export const gatheringMailboxIds = (
  mailboxes: readonly Mailbox[] | undefined,
  requests: SyncRequests,
  pollUntil: number,
  now: number,
): ReadonlySet<string> => {
  const windowOpen = now < pollUntil;
  return new Set(
    (mailboxes ?? [])
      .filter((mailbox) => isGathering(mailbox, now, windowOpen ? requests[mailbox.id] : undefined))
      .map((mailbox) => mailbox.id),
  );
};

/**
 * The next moment gathering can end without new data arriving (the poll window closing or a first
 * sync becoming overdue), so the page can re-render then; null when nothing is pending.
 */
export const nextGatheringChangeAt = (
  mailboxes: readonly Mailbox[] | undefined,
  pollUntil: number,
  now: number,
): number | null => {
  const firstSyncDeadlines = (mailboxes ?? [])
    .filter((mailbox) => mailbox.lastSyncStatus === 'NEVER')
    .map(firstSyncDeadline);
  const upcoming = [pollUntil, ...firstSyncDeadlines].filter((time) => time > now);
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
};

/** Refresh requests need no check here: they only count inside the window, which polls anyway. */
export const mailboxPollInterval = (
  mailboxes: Mailbox[] | undefined,
  pollUntil: number,
  now: number,
): number | false => {
  const anyGathering = mailboxes?.some((mailbox) => isGathering(mailbox, now)) ?? false;
  return anyGathering || now < pollUntil ? SYNC_POLL_INTERVAL_MS : false;
};
