import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  MAILBOXES_QUERY_KEY,
  POST_ACTION_POLL_MS,
  apiErrorCode,
  gatheringMailboxIds,
  listMailboxes,
  isSyncAvailable,
  nextGatheringChangeAt,
  nextSyncAvailableAt,
  mailboxPollInterval,
  syncMailbox,
  unlinkMailbox,
  type Mailbox,
  type SyncRequests,
} from '../services/mailbox.api';
import { CREDIT_CARDS_QUERY_KEY } from '../services/credit-cards.api';
import { EMAIL_ACCOUNTS_QUERY_KEY } from '../services/accounts.api';

const GENERIC_ERROR = 'generic';
const SYNC_TOO_FREQUENT = 'SYNC_TOO_FREQUENT';

/**
 * The error to report after syncing several mailboxes, or null. Once any sync has started, a
 * mailbox rejected for having synced recently is already fresh, so that rejection is not reported.
 */
const syncAllError = (results: readonly PromiseSettledResult<void>[]): string | null => {
  const anyStarted = results.some((result) => result.status === 'fulfilled');
  const codes = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => apiErrorCode(result.reason) ?? GENERIC_ERROR)
    .filter((code) => !(anyStarted && code === SYNC_TOO_FREQUENT));
  return codes[0] ?? null;
};

/** Cards and accounts both come from mailbox syncs, so both are refetched when a mailbox changes. */
const invalidateFoundRecords = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({ queryKey: CREDIT_CARDS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: EMAIL_ACCOUNTS_QUERY_KEY });
};

export type LinkNotice = { severity: 'success' | 'error'; code: string } | null;

const readNotice = (params: URLSearchParams): LinkNotice => {
  if (params.get('linked') === '1') return { severity: 'success', code: 'linked' };
  const error = params.get('error');
  return error ? { severity: 'error', code: error } : null;
};

/** True when the URL carries an OAuth-callback result (?linked=1 or ?error=<CODE>). */
export const hasLinkResult = (params: URLSearchParams): boolean =>
  params.has('linked') || params.has('error');

/**
 * Reads the OAuth-callback query params once and strips them from the URL. Only the page the
 * callback lands on (/profile) should call this.
 */
export const useLinkNotice = (): [LinkNotice, () => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<LinkNotice>(() => readNotice(searchParams));

  useEffect(() => {
    if (hasLinkResult(searchParams)) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return [notice, () => setNotice(null)];
};

interface SyncTracking {
  pollUntil: number;
  syncRequests: SyncRequests;
  markRequested: (mailboxId: string) => void;
}

/** Owns the post-action poll window (opened by a link or a refresh) and when each refresh was asked for. */
const useSyncTracking = (justLinked: boolean): SyncTracking => {
  const [pollUntil, setPollUntil] = useState(() =>
    justLinked ? Date.now() + POST_ACTION_POLL_MS : 0,
  );
  const [syncRequests, setSyncRequests] = useState<SyncRequests>({});

  return {
    pollUntil,
    syncRequests,
    markRequested: (mailboxId) => {
      const now = Date.now();
      setSyncRequests((requests) => ({ ...requests, [mailboxId]: now }));
      setPollUntil(now + POST_ACTION_POLL_MS);
    },
  };
};

/** Re-renders once `time` passes, so state derived from Date.now() updates even when no new data arrives. */
const useRerenderAt = (time: number | null): void => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (time === null) return undefined;
    const timer = setTimeout(() => setTick((tick) => tick + 1), Math.max(0, time - Date.now()));
    return () => clearTimeout(timer);
  }, [time]);
};

const HTTP_NOT_FOUND = 404;
const MAX_RETRIES = 1;

/** The API mounts /mailboxes only when MAILBOX_ENABLED=true, so a 404 means the feature is off. */
const isFeatureOff = (err: unknown): boolean =>
  axios.isAxiosError(err) && err.response?.status === HTTP_NOT_FOUND;

/** A mailbox's last finished sync; cards may have changed once this moves on (even a failed sync saves what it found). */
const finishedSyncKey = (mailbox: Mailbox): string =>
  `${mailbox.lastSyncStatus}@${mailbox.lastSyncedAt ?? ''}`;

/**
 * Refetches cards and accounts when a mailbox finishes a sync, so they appear without a reload.
 * A RUNNING sync keeps its previous key, so starting a sync alone does not refetch.
 */
const useRefreshFoundRecordsOnSync = (mailboxes: readonly Mailbox[] | undefined): void => {
  const queryClient = useQueryClient();
  const finished = useRef(new Map<string, string>());
  useEffect(() => {
    let changed = false;
    (mailboxes ?? [])
      .filter((mailbox) => mailbox.lastSyncStatus !== 'RUNNING')
      .forEach((mailbox) => {
        const key = finishedSyncKey(mailbox);
        const previous = finished.current.get(mailbox.id);
        if (previous !== undefined && previous !== key) changed = true;
        finished.current.set(mailbox.id, key);
      });
    if (changed) invalidateFoundRecords(queryClient);
  }, [mailboxes, queryClient]);
};

export interface MailboxesState {
  /** True once the server has confirmed mailbox linking is on (false while loading or when it is off). */
  isAvailable: boolean;
  mailboxes: Mailbox[] | undefined;
  isLoading: boolean;
  isError: boolean;
  gatheringIds: ReadonlySet<string>;
  actionError: string | null;
  clearActionError: () => void;
  isBusy: boolean;
  isUnlinking: boolean;
  refresh: (mailboxId: string) => void;
  /** Syncs every mailbox that can sync now: not awaiting a reconnect, gathering, or cooling down. */
  refreshAll: () => void;
  /** False while an action runs or when no mailbox can sync now. */
  canRefreshAll: boolean;
  /** Mailboxes the server would sync now; every Refresh button checks this one rule. */
  syncableIds: ReadonlySet<string>;
  unlinkTarget: Mailbox | null;
  setUnlinkTarget: (mailbox: Mailbox | null) => void;
  confirmUnlink: (mailbox: Mailbox) => void;
}

interface UseMailboxesOptions {
  /** A mailbox was linked just before this page loaded, so poll until its first sync shows up. */
  readonly justLinked?: boolean;
}

/** Linked mailboxes with their sync progress and the refresh/unlink actions. */
export const useMailboxes = ({ justLinked = false }: UseMailboxesOptions = {}): MailboxesState => {
  const queryClient = useQueryClient();
  const { pollUntil, syncRequests, markRequested } = useSyncTracking(justLinked);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<Mailbox | null>(null);

  const {
    data: mailboxes,
    isLoading,
    error,
  } = useQuery({
    queryKey: MAILBOXES_QUERY_KEY,
    queryFn: listMailboxes,
    retry: (failureCount, err) => !isFeatureOff(err) && failureCount < MAX_RETRIES,
    refetchInterval: (query) => mailboxPollInterval(query.state.data, pollUntil, Date.now()),
  });
  const isError = error !== null && !isFeatureOff(error);
  const isAvailable = mailboxes !== undefined || isError;

  const refreshList = (): void => {
    void queryClient.invalidateQueries({ queryKey: MAILBOXES_QUERY_KEY });
  };
  const reportError = (err: unknown): void => setActionError(apiErrorCode(err) ?? GENERIC_ERROR);

  // Syncs one mailbox (Refresh on a row) or several at once (Refresh on the dashboard).
  const syncAllMutation = useMutation({
    mutationFn: async (mailboxIds: readonly string[]) => {
      const results = await Promise.allSettled(mailboxIds.map(syncMailbox));
      return { mailboxIds, results };
    },
    onMutate: () => setActionError(null),
    onSuccess: ({ mailboxIds, results }) => {
      mailboxIds
        .filter((_mailboxId, index) => results[index]?.status === 'fulfilled')
        .forEach(markRequested);
      setActionError(syncAllError(results));
      refreshList();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: unlinkMailbox,
    onMutate: () => setActionError(null),
    // Unlinking deletes cards and accounts found only in that mailbox.
    onSuccess: () => {
      refreshList();
      invalidateFoundRecords(queryClient);
    },
    onError: reportError,
    onSettled: () => setUnlinkTarget(null),
  });

  const now = Date.now();
  const gatheringIds = gatheringMailboxIds(mailboxes, syncRequests, pollUntil, now);
  useRerenderAt(nextGatheringChangeAt(mailboxes, pollUntil, now));
  useRerenderAt(nextSyncAvailableAt(mailboxes, now));
  useRefreshFoundRecordsOnSync(mailboxes);
  const isBusy = syncAllMutation.isPending || unlinkMutation.isPending;
  // Awaiting a reconnect, already gathering, or in the server's cooldown: the server would refuse.
  const syncableIds: ReadonlySet<string> = new Set(
    (mailboxes ?? [])
      .filter(
        (mailbox) =>
          mailbox.status !== 'REAUTH_REQUIRED' &&
          !gatheringIds.has(mailbox.id) &&
          isSyncAvailable(mailbox, now),
      )
      .map((mailbox) => mailbox.id),
  );

  return {
    isAvailable,
    mailboxes,
    isLoading,
    isError,
    gatheringIds,
    actionError,
    clearActionError: () => setActionError(null),
    isBusy,
    isUnlinking: unlinkMutation.isPending,
    refresh: (mailboxId) => syncAllMutation.mutate([mailboxId]),
    refreshAll: () => syncAllMutation.mutate([...syncableIds]),
    canRefreshAll: !isBusy && syncableIds.size > 0,
    syncableIds,
    unlinkTarget,
    setUnlinkTarget,
    confirmUnlink: (mailbox) => unlinkMutation.mutate(mailbox.id),
  };
};
