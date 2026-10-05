import React from 'react';
import { Alert, Paper, Skeleton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Mailbox } from '../../services/mailbox.api';
import { MailboxList } from './MailboxList';

const SKELETON_ROWS = 2;

interface MailboxesPanelProps {
  readonly mailboxes: readonly Mailbox[] | undefined;
  readonly syncableIds: ReadonlySet<string>;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isBusy: boolean;
  readonly onRefresh: (mailboxId: string) => void;
  readonly onUnlink: (mailbox: Mailbox) => void;
  readonly onReconnect: () => void;
}

export const MailboxesPanel: React.FC<MailboxesPanelProps> = ({
  mailboxes,
  syncableIds,
  isLoading,
  isError,
  isBusy,
  onRefresh,
  onUnlink,
  onReconnect,
}) => {
  const { t } = useTranslation('mailbox');

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {t('mailboxes.title')}
      </Typography>
      {isLoading &&
        Array.from({ length: SKELETON_ROWS }, (_value, index) => (
          <Skeleton key={index} variant="text" height={48} />
        ))}
      {isError && <Alert severity="error">{t('mailboxes.loadFailed')}</Alert>}
      {mailboxes && mailboxes.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('mailboxes.empty')}
        </Typography>
      )}
      {mailboxes && mailboxes.length > 0 && (
        <MailboxList
          mailboxes={mailboxes}
          syncableIds={syncableIds}
          isBusy={isBusy}
          onRefresh={onRefresh}
          onUnlink={onUnlink}
          onReconnect={onReconnect}
        />
      )}
    </Paper>
  );
};
