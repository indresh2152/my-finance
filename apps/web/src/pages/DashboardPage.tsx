import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Container, IconButton, Snackbar, Stack, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../context/AuthContext';
import { AmountVisibilityContext } from '../context/AmountVisibilityContext';
import { CREDIT_CARDS_QUERY_KEY, listCreditCards } from '../services/credit-cards.api';
import { useMailboxes } from '../hooks/useMailboxes';
import { useStatementDownload } from '../hooks/useStatementDownload';
import { CreditCardTile } from '../components/cards/CreditCardTile';
import { TileGrid } from '../components/TileGrid';
import { LinkPanAlert } from '../components/LinkPanAlert';
import { PageTitle } from '../components/PageTitle';
import { MailboxAlerts } from '../components/mailbox/MailboxAlerts';
import { SyncProgressBanner } from '../components/mailbox/SyncProgressBanner';

const SKELETON_CARDS = 3;

/** Statement-specific wording first, then the shared mailbox error text, then a generic message. */
const downloadErrorMessage = (t: TFunction<'cards'>, code: string): string =>
  t([`statement.errors.${code}`, `mailbox:errors.${code}`, 'statement.errors.generic'] as never);
const DOWNLOAD_ERROR_HIDE_MS = 6000;

interface ShowAllToggleProps {
  readonly showAll: boolean;
  readonly onToggle: () => void;
}

/** Shows or hides every masked amount on the dashboard at once. */
const ShowAllToggle: React.FC<ShowAllToggleProps> = ({ showAll, onToggle }) => {
  const { t } = useTranslation('cards');
  // A toggle keeps one name and reports its state through aria-pressed; only the tooltip changes.
  return (
    <Tooltip title={t(showAll ? 'amount.hideAll' : 'amount.showAll')}>
      <IconButton aria-label={t('amount.showAll')} aria-pressed={showAll} onClick={onToggle}>
        {showAll ? <VisibilityOffIcon /> : <VisibilityIcon />}
      </IconButton>
    </Tooltip>
  );
};

interface RefreshButtonProps {
  readonly disabled: boolean;
  readonly onClick: () => void;
}

/** Syncs every linked email; new cards and statements appear when the syncs finish. */
const RefreshButton: React.FC<RefreshButtonProps> = ({ disabled, onClick }) => {
  const { t } = useTranslation('mailbox');
  return (
    <Tooltip title={t('refreshAll.hint')}>
      {/* A disabled button fires no events, so the tooltip needs a wrapper to anchor to. */}
      <span>
        <Button size="small" startIcon={<RefreshIcon />} disabled={disabled} onClick={onClick}>
          {t('refreshAll.label')}
        </Button>
      </span>
    </Tooltip>
  );
};

interface CardGridProps {
  /** The empty state's next step; omitted when there is none to suggest. */
  readonly emptyHint?: string;
  readonly isDownloading: boolean;
  /** Absent when mailbox features are off, since statements are fetched from the mailbox. */
  readonly onDownload?: (statementId: string) => void;
}

const CardGrid: React.FC<CardGridProps> = ({ emptyHint, isDownloading, onDownload }) => {
  const { t } = useTranslation('cards');
  const {
    data: cards,
    isLoading,
    isError,
  } = useQuery({ queryKey: CREDIT_CARDS_QUERY_KEY, queryFn: listCreditCards });

  return (
    <TileGrid
      items={cards}
      isLoading={isLoading}
      isError={isError}
      skeletonCount={SKELETON_CARDS}
      errorText={t('errors.loadFailed')}
      emptyText={t('emptyState')}
      emptyHint={emptyHint}
      renderTile={(card) => (
        <CreditCardTile card={card} isDownloading={isDownloading} onDownload={onDownload} />
      )}
    />
  );
};

/**
 * Shown to a user who skipped PAN registration (ProtectedRoute sends any other user without a PAN
 * to /pan-register): cards need a PAN, so none are loaded.
 */
const LinkPanPrompt: React.FC = () => {
  const { t } = useTranslation('common');
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <PageTitle>{t('dashboard.title')}</PageTitle>
        <LinkPanAlert message={t('dashboard.linkPanPrompt')} />
      </Stack>
    </Container>
  );
};

const Dashboard: React.FC = () => {
  const { t } = useTranslation('cards');
  const { t: tCommon } = useTranslation('common');
  const mailbox = useMailboxes();
  const statements = useStatementDownload();
  const [showAllAmounts, setShowAllAmounts] = useState(false);
  const hasMailbox = (mailbox.mailboxes?.length ?? 0) > 0;
  // With mailbox features off there is nowhere to link an email, so no hint suggests it; with one
  // linked, the empty state reports that nothing was found rather than asking to link one.
  let cardsEmptyHint: string | undefined;
  if (mailbox.isAvailable)
    cardsEmptyHint = t(hasMailbox ? 'emptyStateMailboxLinked' : 'emptyStateHint');

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        mb={3}
      >
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <PageTitle>{tCommon('dashboard.title')}</PageTitle>
          <ShowAllToggle
            showAll={showAllAmounts}
            onToggle={() => setShowAllAmounts((shown) => !shown)}
          />
        </Stack>
        {hasMailbox && (
          <RefreshButton disabled={!mailbox.canRefreshAll} onClick={mailbox.refreshAll} />
        )}
      </Stack>

      <Stack spacing={3}>
        <MailboxAlerts
          actionError={mailbox.actionError}
          onCloseActionError={mailbox.clearActionError}
        />
        {mailbox.gatheringIds.size > 0 && <SyncProgressBanner />}

        <AmountVisibilityContext.Provider value={showAllAmounts}>
          <CardGrid
            emptyHint={cardsEmptyHint}
            isDownloading={statements.isDownloading}
            onDownload={mailbox.isAvailable ? statements.download : undefined}
          />
        </AmountVisibilityContext.Provider>
      </Stack>

      <Snackbar
        open={statements.errorCode !== null}
        autoHideDuration={DOWNLOAD_ERROR_HIDE_MS}
        onClose={statements.clearError}
        message={statements.errorCode && downloadErrorMessage(t, statements.errorCode)}
      />
    </Container>
  );
};

/** The user's credit cards. Linked emails are managed on the profile page. */
export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  return user.hasPan ? <Dashboard /> : <LinkPanPrompt />;
};
