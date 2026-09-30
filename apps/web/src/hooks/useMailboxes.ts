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
  nextGatheringChangeAt,
  mailboxPollInterval,
  syncMailbox,
  unlinkMailbox,
  type Mailbox,
  type SyncRequests,
} from '../services/mailbox.api';
import { CREDIT_CARDS_QUERY_KEY } from '../services/credit-cards.api';
import { EMAIL_ACCOUNTS_QUERY_KEY } from '../services/accounts.api';

const GENERIC_ERROR = 'generic';

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

/** Reads the OAuth-callback query params once and strips them from the URL. */
const useLinkNotice = (): [LinkNotice, () => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<LinkNotice>(() => readNotice(searchParams));

  useEffect(() => {
    if (searchParams.has('linked') || searchParams.has('error')) {
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
  notice: LinkNotice;
  clearNotice: () => void;
  actionError: string | null;
  clearActionError: () => void;
  isBusy: boolean;
  isUnlinking: boolean;
  refresh: (mailboxId: string) => void;
  unlinkTarget: Mailbox | null;
  setUnlinkTarget: (mailbox: Mailbox | null) => void;
  confirmUnlink: (mailbox: Mailbox) => void;
}

/** Linked mailboxes with their sync progress, the OAuth-callback notice, and the refresh/unlink actions. */
export const useMailboxes = (): MailboxesState => {
  const queryClient = useQueryClient();
  const [notice, clearNotice] = useLinkNotice();
  const { pollUntil, syncRequests, markRequested } = useSyncTracking(
    notice?.severity === 'success',
  );
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
  const isAvailable = mailboxes !== undefined || (error !== null && !isFeatureOff(error));

  const refreshList = (): void => {
    void queryClient.invalidateQueries({ queryKey: MAILBOXES_QUERY_KEY });
  };
  const reportError = (err: unknown): void => setActionError(apiErrorCode(err) ?? GENERIC_ERROR);

  const syncMutation = useMutation({
    mutationFn: syncMailbox,
    onMutate: () => setActionError(null),
    onSuccess: (_data, mailboxId) => {
      markRequested(mailboxId);
      refreshList();
    },
    onError: reportError,
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
  useRefreshFoundRecordsOnSync(mailboxes);

  return {
    isAvailable,
    mailboxes,
    isLoading,
    isError: error !== null && !isFeatureOff(error),
    gatheringIds,
    notice,
    clearNotice,
    actionError,
    clearActionError: () => setActionError(null),
    isBusy: syncMutation.isPending || unlinkMutation.isPending,
    isUnlinking: unlinkMutation.isPending,
    refresh: (mailboxId) => syncMutation.mutate(mailboxId),
    unlinkTarget,
    setUnlinkTarget,
    confirmUnlink: (mailbox) => unlinkMutation.mutate(mailbox.id),
  };
};
