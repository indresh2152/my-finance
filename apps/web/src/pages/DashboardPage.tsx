import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Container, Stack, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { AmountVisibilityContext } from '../context/AmountVisibilityContext';
import { CREDIT_CARDS_QUERY_KEY, listCreditCards } from '../services/credit-cards.api';
import type { Mailbox } from '../services/mailbox.api';
import { useMailboxes } from '../hooks/useMailboxes';
import { useStatementDownload } from '../hooks/useStatementDownload';
import { CreditCardTile } from '../components/cards/CreditCardTile';
import { DownloadErrorSnackbar } from '../components/cards/DownloadErrorSnackbar';
import { ShowAllToggle } from '../components/cards/ShowAllToggle';
import { TileGrid } from '../components/TileGrid';
import { LinkPanAlert } from '../components/LinkPanAlert';
import { PageTitle } from '../components/PageTitle';
import { MailboxAlerts } from '../components/mailbox/MailboxAlerts';
import { ALL_MAILBOXES, MailboxFilter } from '../components/mailbox/MailboxFilter';
import { SyncProgressBanner } from '../components/mailbox/SyncProgressBanner';

const SKELETON_CARDS = 3;

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
  readonly mailboxes: readonly Mailbox[];
  /** ALL_MAILBOXES, or the id of the mailbox whose cards to show. */
  readonly mailboxFilter: string;
  /** The empty state's next step; omitted when there is none to suggest. */
  readonly emptyHint?: string;
  readonly isDownloading: boolean;
  /** Absent when mailbox features are off, since statements are fetched from the mailbox. */
  readonly onDownload?: (statementId: string) => void;
}

const CardGrid: React.FC<CardGridProps> = ({
  mailboxes,
  mailboxFilter,
  emptyHint,
  isDownloading,
  onDownload,
}) => {
  const { t } = useTranslation('cards');
  const {
    data: cards,
    isLoading,
    isError,
  } = useQuery({ queryKey: CREDIT_CARDS_QUERY_KEY, queryFn: listCreditCards });
  const emailById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.emailMasked]));
  const isFiltered = mailboxFilter !== ALL_MAILBOXES;
  const shownCards = isFiltered
    ? cards?.filter((card) => card.mailboxIds.includes(mailboxFilter))
    : cards;

  return (
    <TileGrid
      items={shownCards}
      isLoading={isLoading}
      isError={isError}
      skeletonCount={SKELETON_CARDS}
      errorText={t('errors.loadFailed')}
      emptyText={t(isFiltered ? 'emptyStateFiltered' : 'emptyState')}
      emptyHint={isFiltered ? undefined : emptyHint}
      renderTile={(card) => (
        <CreditCardTile
          card={card}
          // An id with no match is a mailbox unlinked since the cards were loaded.
          sourceEmails={card.mailboxIds.flatMap((id) => emailById.get(id) ?? [])}
          isDownloading={isDownloading}
          onDownload={onDownload}
        />
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
  const [selectedMailbox, setSelectedMailbox] = useState(ALL_MAILBOXES);
  const mailboxes = mailbox.mailboxes ?? [];
  const hasMailbox = mailboxes.length > 0;
  // A mailbox unlinked while selected leaves nothing to filter by, so every card shows again.
  const mailboxFilter = mailboxes.some(({ id }) => id === selectedMailbox)
    ? selectedMailbox
    : ALL_MAILBOXES;
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
          <Stack direction="row" alignItems="center" spacing={1}>
            <RefreshButton disabled={!mailbox.canRefreshAll} onClick={mailbox.refreshAll} />
            <MailboxFilter
              mailboxes={mailboxes}
              value={mailboxFilter}
              onChange={setSelectedMailbox}
            />
          </Stack>
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
            mailboxes={mailboxes}
            mailboxFilter={mailboxFilter}
            emptyHint={cardsEmptyHint}
            isDownloading={statements.isDownloading}
            onDownload={mailbox.isAvailable ? statements.download : undefined}
          />
        </AmountVisibilityContext.Provider>
      </Stack>

      <DownloadErrorSnackbar download={statements} />
    </Container>
  );
};

/** The user's credit cards. Linked emails are managed on the profile page. */
export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  return user.hasPan ? <Dashboard /> : <LinkPanPrompt />;
};
