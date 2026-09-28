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
  createdAt: string;
}

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

export const mailboxPollInterval = (
  mailboxes: Mailbox[] | undefined,
  pollUntil: number,
  now: number,
): number | false => {
  const anyRunning = mailboxes?.some((mailbox) => mailbox.lastSyncStatus === 'RUNNING') ?? false;
  return anyRunning || now < pollUntil ? SYNC_POLL_INTERVAL_MS : false;
};
