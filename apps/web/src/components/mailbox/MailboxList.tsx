import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItem,
  Stack,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Mailbox } from '../../services/mailbox.api';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface MailboxListProps {
  readonly mailboxes: readonly Mailbox[];
  readonly isBusy: boolean;
  readonly onRefresh: (mailboxId: string) => void;
  readonly onUnlink: (mailbox: Mailbox) => void;
  readonly onReconnect: () => void;
}

interface SyncStatusProps {
  readonly mailbox: Mailbox;
}

const SyncStatus: React.FC<SyncStatusProps> = ({ mailbox }) => {
  const { t } = useTranslation('mailbox');

  if (mailbox.status === 'REAUTH_REQUIRED') {
    return <Chip color="warning" size="small" label={t('mailboxes.reauthRequired')} />;
  }
  if (mailbox.lastSyncStatus === 'RUNNING') {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <CircularProgress size={14} />
        <Typography variant="caption">{t('mailboxes.syncing')}</Typography>
      </Stack>
    );
  }
  if (mailbox.lastSyncStatus === 'FAILED') {
    return (
      <Typography variant="caption" color="error">
        {t('mailboxes.syncFailed')}
      </Typography>
    );
  }
  return (
    <Typography variant="caption" color="text.secondary">
      {mailbox.lastSyncedAt
        ? t('mailboxes.lastSynced', {
            when: DATE_TIME_FORMATTER.format(new Date(mailbox.lastSyncedAt)),
          })
        : t('mailboxes.neverSynced')}
    </Typography>
  );
};

export const MailboxList: React.FC<MailboxListProps> = ({
  mailboxes,
  isBusy,
  onRefresh,
  onUnlink,
  onReconnect,
}) => {
  const { t } = useTranslation('mailbox');

  return (
    <List disablePadding>
      {mailboxes.map((mailbox) => {
        const needsReauth = mailbox.status === 'REAUTH_REQUIRED';
        return (
          <ListItem key={mailbox.id} divider sx={{ flexWrap: 'wrap', gap: 1, px: 0 }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" variant="outlined" label={t(`provider.${mailbox.provider}`)} />
                <Typography variant="body1" fontWeight={600} noWrap>
                  {mailbox.emailMasked}
                </Typography>
              </Stack>
              <Box mt={0.5}>
                <SyncStatus mailbox={mailbox} />
              </Box>
            </Box>
            <Stack direction="row" spacing={1}>
              {needsReauth ? (
                <Button size="small" variant="contained" onClick={onReconnect}>
                  {t('mailboxes.reconnect')}
                </Button>
              ) : (
                <Button
                  size="small"
                  disabled={isBusy || mailbox.lastSyncStatus === 'RUNNING'}
                  onClick={() => onRefresh(mailbox.id)}
                >
                  {t('mailboxes.refresh')}
                </Button>
              )}
              <Button
                size="small"
                color="error"
                disabled={isBusy}
                onClick={() => onUnlink(mailbox)}
              >
                {t('mailboxes.unlink')}
              </Button>
            </Stack>
          </ListItem>
        );
      })}
    </List>
  );
};
