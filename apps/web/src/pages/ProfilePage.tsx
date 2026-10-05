import React, { useState } from 'react';
import { Button, Container, Paper, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { useAuth, type AuthUser } from '../context/AuthContext';
import { useLinkNotice, useMailboxes } from '../hooks/useMailboxes';
import { LinkPanAlert } from '../components/LinkPanAlert';
import { PageTitle } from '../components/PageTitle';
import { LinkMailboxDialog } from '../components/mailbox/LinkMailboxDialog';
import { MailboxAlerts } from '../components/mailbox/MailboxAlerts';
import { MailboxesPanel } from '../components/mailbox/MailboxesPanel';
import { SyncProgressBanner } from '../components/mailbox/SyncProgressBanner';
import { UnlinkMailboxDialog } from '../components/mailbox/UnlinkMailboxDialog';

interface AccountDetailsProps {
  readonly user: AuthUser;
}

const AccountDetails: React.FC<AccountDetailsProps> = ({ user }) => {
  const { t } = useTranslation('common');
  const fields = [
    { label: t('profile.username'), value: user.username },
    { label: t('profile.email'), value: user.email },
  ];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        {fields.map(({ label, value }) => (
          <Stack key={label} spacing={0.25}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="body1">{value}</Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
};

/** Linked mailboxes with link, refresh, unlink and reconnect. The OAuth callback lands here. */
const LinkedEmails: React.FC = () => {
  const { t } = useTranslation('mailbox');
  const [notice, clearNotice] = useLinkNotice();
  const mailbox = useMailboxes({ justLinked: notice?.severity === 'success' });
  const [isLinkDialogOpen, setLinkDialogOpen] = useState(false);
  const openLinkDialog = (): void => setLinkDialogOpen(true);

  return (
    <Stack spacing={2}>
      <MailboxAlerts
        notice={notice}
        onCloseNotice={clearNotice}
        actionError={mailbox.actionError}
        onCloseActionError={mailbox.clearActionError}
      />
      {mailbox.gatheringIds.size > 0 && <SyncProgressBanner />}
      {mailbox.isAvailable && (
        <>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={openLinkDialog}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('linkEmail')}
          </Button>
          <MailboxesPanel
            mailboxes={mailbox.mailboxes}
            syncableIds={mailbox.syncableIds}
            isLoading={mailbox.isLoading}
            isError={mailbox.isError}
            isBusy={mailbox.isBusy}
            onRefresh={mailbox.refresh}
            onUnlink={mailbox.setUnlinkTarget}
            onReconnect={openLinkDialog}
          />
        </>
      )}

      <LinkMailboxDialog open={isLinkDialogOpen} onClose={() => setLinkDialogOpen(false)} />
      <UnlinkMailboxDialog
        mailbox={mailbox.unlinkTarget}
        isBusy={mailbox.isUnlinking}
        onCancel={() => mailbox.setUnlinkTarget(null)}
        onConfirm={mailbox.confirmUnlink}
      />
    </Stack>
  );
};

/** The signed-in user's details and linked emails. */
export const ProfilePage: React.FC = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <PageTitle>{t('profile.title')}</PageTitle>
        <AccountDetails user={user} />
        {user.hasPan ? (
          <LinkedEmails />
        ) : (
          // Mailboxes belong to a PAN profile, so linking one needs a PAN first.
          <LinkPanAlert message={t('profile.linkPanFirst')} />
        )}
      </Stack>
    </Container>
  );
};
