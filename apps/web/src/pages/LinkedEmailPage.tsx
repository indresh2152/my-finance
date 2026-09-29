import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { Alert, Container, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
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
import { UnlinkMailboxDialog } from '../components/mailbox/UnlinkMailboxDialog';
import { AddMailboxForm, MAILBOX_EMAIL_INPUT_ID } from '../components/mailbox/AddMailboxForm';
import { MailboxesPanel } from '../components/mailbox/MailboxesPanel';
import { SyncProgressBanner } from '../components/mailbox/SyncProgressBanner';

const GENERIC_ERROR = 'generic';

type Notice = { severity: 'success' | 'error'; code: string } | null;

const readNotice = (params: URLSearchParams): Notice => {
  if (params.get('linked') === '1') return { severity: 'success', code: 'linked' };
  const error = params.get('error');
  return error ? { severity: 'error', code: error } : null;
};

const focusEmailInput = (): void => {
  document.getElementById(MAILBOX_EMAIL_INPUT_ID)?.focus();
};

interface NoticeState {
  notice: Notice;
  clearNotice: () => void;
}

/** Reads the OAuth-callback query params once and strips them from the URL. */
const useLinkNotice = (): NoticeState => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<Notice>(() => readNotice(searchParams));

  useEffect(() => {
    if (searchParams.has('linked') || searchParams.has('error')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return { notice, clearNotice: () => setNotice(null) };
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

interface MailboxActions {
  syncMutation: UseMutationResult<void, unknown, string>;
  unlinkMutation: UseMutationResult<void, unknown, string>;
}

/** Wraps the sync and unlink mutations so the page reports a single action error and refreshes the list. */
const useMailboxActions = (
  onSynced: (mailboxId: string) => void,
  reportError: (code: string | null) => void,
  onUnlinkSettled: () => void,
): MailboxActions => {
  const queryClient = useQueryClient();
  const refreshList = (): void => {
    void queryClient.invalidateQueries({ queryKey: MAILBOXES_QUERY_KEY });
  };

  const syncMutation = useMutation({
    mutationFn: syncMailbox,
    onMutate: () => reportError(null),
    onSuccess: (_data, mailboxId) => {
      onSynced(mailboxId);
      refreshList();
    },
    onError: (err) => reportError(apiErrorCode(err) ?? GENERIC_ERROR),
  });

  const unlinkMutation = useMutation({
    mutationFn: unlinkMailbox,
    onMutate: () => reportError(null),
    onSuccess: () => {
      onUnlinkSettled();
      refreshList();
    },
    onError: (err) => {
      onUnlinkSettled();
      reportError(apiErrorCode(err) ?? GENERIC_ERROR);
    },
  });

  return { syncMutation, unlinkMutation };
};

export const LinkedEmailPage: React.FC = () => {
  const { t } = useTranslation('mailbox');
  const { notice, clearNotice } = useLinkNotice();
  const { pollUntil, syncRequests, markRequested } = useSyncTracking(
    notice?.severity === 'success',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<Mailbox | null>(null);

  const {
    data: mailboxes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: MAILBOXES_QUERY_KEY,
    queryFn: listMailboxes,
    refetchInterval: (query) => mailboxPollInterval(query.state.data, pollUntil, Date.now()),
  });

  const { syncMutation, unlinkMutation } = useMailboxActions(markRequested, setActionError, () =>
    setUnlinkTarget(null),
  );
  const now = Date.now();
  const gatheringIds = gatheringMailboxIds(mailboxes, syncRequests, pollUntil, now);
  useRerenderAt(nextGatheringChangeAt(mailboxes, pollUntil, now));

  const translateError = (code: string): string =>
    t(`errors.${code}`, { defaultValue: t('errors.generic') });

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {t('pageTitle')}
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={3}>
        {t('pageSubtitle')}
      </Typography>

      <Stack spacing={2}>
        {notice && (
          <Alert severity={notice.severity} onClose={clearNotice}>
            {notice.severity === 'success' ? t('notices.linked') : translateError(notice.code)}
          </Alert>
        )}
        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)}>
            {translateError(actionError)}
          </Alert>
        )}

        {gatheringIds.size > 0 && <SyncProgressBanner />}

        <MailboxesPanel
          mailboxes={mailboxes}
          gatheringIds={gatheringIds}
          isLoading={isLoading}
          isError={isError}
          isBusy={syncMutation.isPending || unlinkMutation.isPending}
          onRefresh={(mailboxId) => syncMutation.mutate(mailboxId)}
          onUnlink={setUnlinkTarget}
          onReconnect={focusEmailInput}
        />

        <Paper variant="outlined" sx={{ p: 2 }}>
          <AddMailboxForm />
        </Paper>
      </Stack>

      <UnlinkMailboxDialog
        mailbox={unlinkTarget}
        isBusy={unlinkMutation.isPending}
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={(mailbox) => unlinkMutation.mutate(mailbox.id)}
      />
    </Container>
  );
};
