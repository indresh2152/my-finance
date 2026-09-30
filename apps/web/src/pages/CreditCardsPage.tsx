import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Container, Link, Snackbar, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../context/AuthContext';
import { CREDIT_CARDS_QUERY_KEY, listCreditCards } from '../services/credit-cards.api';
import { useMailboxes, type LinkNotice } from '../hooks/useMailboxes';
import { useStatementDownload } from '../hooks/useStatementDownload';
import { CreditCardTile } from '../components/cards/CreditCardTile';
import { TileGrid } from '../components/TileGrid';
import { BankAccountsSection } from '../components/accounts/BankAccountsSection';
import { LinkMailboxDialog } from '../components/mailbox/LinkMailboxDialog';
import { MailboxesPanel } from '../components/mailbox/MailboxesPanel';
import { SyncProgressBanner } from '../components/mailbox/SyncProgressBanner';
import { UnlinkMailboxDialog } from '../components/mailbox/UnlinkMailboxDialog';

const SKELETON_CARDS = 3;

/** Statement-specific wording first, then the shared mailbox error text, then a generic message. */
const downloadErrorMessage = (t: TFunction<'cards'>, code: string): string =>
  t([`statement.errors.${code}`, `mailbox:errors.${code}`, 'statement.errors.generic'] as never);
const DOWNLOAD_ERROR_HIDE_MS = 6000;

interface LinkEmailLinkProps {
  readonly onClick: () => void;
}

const LinkEmailLink: React.FC<LinkEmailLinkProps> = ({ onClick }) => {
  const { t } = useTranslation('cards');
  return (
    <Link
      component="button"
      type="button"
      variant="body2"
      onClick={onClick}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
    >
      <AddIcon fontSize="small" />
      {t('linkEmail')}
    </Link>
  );
};

interface MailboxAlertsProps {
  readonly notice: LinkNotice;
  readonly onCloseNotice: () => void;
  readonly actionError: string | null;
  readonly onCloseActionError: () => void;
}

const MailboxAlerts: React.FC<MailboxAlertsProps> = ({
  notice,
  onCloseNotice,
  actionError,
  onCloseActionError,
}) => {
  const { t } = useTranslation('mailbox');
  const translateError = (code: string): string =>
    t(`errors.${code}`, { defaultValue: t('errors.generic') });

  return (
    <>
      {notice && (
        <Alert severity={notice.severity} onClose={onCloseNotice}>
          {notice.severity === 'success' ? t('notices.linked') : translateError(notice.code)}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" onClose={onCloseActionError}>
          {translateError(actionError)}
        </Alert>
      )}
    </>
  );
};

interface CardGridProps {
  /** With a mailbox already linked, the empty state reports that nothing was found rather than asking to link one. */
  readonly hasMailbox: boolean;
  readonly isDownloading: boolean;
  /** Absent when mailbox features are off, since statements are fetched from the mailbox. */
  readonly onDownload?: (statementId: string) => void;
}

const CardGrid: React.FC<CardGridProps> = ({ hasMailbox, isDownloading, onDownload }) => {
  const { t } = useTranslation('cards');
  const { user } = useAuth();

  const {
    data: cards,
    isLoading,
    isError,
  } = useQuery({
    queryKey: CREDIT_CARDS_QUERY_KEY,
    queryFn: listCreditCards,
    enabled: !!user?.hasPan,
  });

  return (
    <TileGrid
      items={cards}
      isLoading={isLoading}
      isError={isError}
      skeletonCount={SKELETON_CARDS}
      errorText={t('errors.loadFailed')}
      emptyText={t('emptyState')}
      emptyHint={hasMailbox ? t('emptyStateMailboxLinked') : t('emptyStateHint')}
      renderTile={(card) => (
        <CreditCardTile card={card} isDownloading={isDownloading} onDownload={onDownload} />
      )}
    />
  );
};

export const CreditCardsPage: React.FC = () => {
  const { t } = useTranslation('cards');
  const mailbox = useMailboxes();
  const statements = useStatementDownload();
  const [isLinkDialogOpen, setLinkDialogOpen] = useState(false);
  const openLinkDialog = (): void => setLinkDialogOpen(true);
  const hasMailbox = (mailbox.mailboxes?.length ?? 0) > 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        mb={3}
      >
        <Typography variant="h4" fontWeight={700}>
          {t('pageTitle')}
        </Typography>
        {mailbox.isAvailable && <LinkEmailLink onClick={openLinkDialog} />}
      </Stack>

      <Stack spacing={3}>
        <MailboxAlerts
          notice={mailbox.notice}
          onCloseNotice={mailbox.clearNotice}
          actionError={mailbox.actionError}
          onCloseActionError={mailbox.clearActionError}
        />
        {mailbox.gatheringIds.size > 0 && <SyncProgressBanner />}

        <CardGrid
          hasMailbox={hasMailbox}
          isDownloading={statements.isDownloading}
          onDownload={mailbox.isAvailable ? statements.download : undefined}
        />

        {mailbox.isAvailable && <BankAccountsSection hasMailbox={hasMailbox} />}

        {mailbox.isAvailable && (
          <MailboxesPanel
            mailboxes={mailbox.mailboxes}
            gatheringIds={mailbox.gatheringIds}
            isLoading={mailbox.isLoading}
            isError={mailbox.isError}
            isBusy={mailbox.isBusy}
            onRefresh={mailbox.refresh}
            onUnlink={mailbox.setUnlinkTarget}
            onReconnect={openLinkDialog}
          />
        )}
      </Stack>

      <LinkMailboxDialog open={isLinkDialogOpen} onClose={() => setLinkDialogOpen(false)} />
      <UnlinkMailboxDialog
        mailbox={mailbox.unlinkTarget}
        isBusy={mailbox.isUnlinking}
        onCancel={() => mailbox.setUnlinkTarget(null)}
        onConfirm={mailbox.confirmUnlink}
      />
      <Snackbar
        open={statements.errorCode !== null}
        autoHideDuration={DOWNLOAD_ERROR_HIDE_MS}
        onClose={statements.clearError}
        message={statements.errorCode && downloadErrorMessage(t, statements.errorCode)}
      />
    </Container>
  );
};
