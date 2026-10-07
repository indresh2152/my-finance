import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Container, Skeleton, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { AmountVisibilityContext } from '../context/AmountVisibilityContext';
import { apiErrorCode } from '../services/api';
import { cardStatementsQueryKey, getCardStatements } from '../services/credit-cards.api';
import { useMailboxAvailability } from '../hooks/useMailboxes';
import { useStatementDownload } from '../hooks/useStatementDownload';
import { cardLabel } from '../components/cards/cardPage';
import { DownloadErrorSnackbar } from '../components/cards/DownloadErrorSnackbar';
import { ShowAllToggle } from '../components/cards/ShowAllToggle';
import { StatementHistoryTable } from '../components/cards/StatementHistoryTable';
import { StatementTrendChart } from '../components/cards/StatementTrendChart';
import { LinkPanAlert } from '../components/LinkPanAlert';
import { PageTitle } from '../components/PageTitle';

/** A malformed card ID is as unknown as a card that is not the user's. */
const NOT_FOUND_CODES = new Set(['CARD_NOT_FOUND', 'VALIDATION_ERROR']);
const SKELETON_HEIGHT = 320;

const BackToDashboard: React.FC = () => {
  const { t } = useTranslation('cards');
  return (
    <Box>
      <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} size="small">
        {t('history.back')}
      </Button>
    </Box>
  );
};

interface CardStatementsProps {
  readonly cardId: string;
}

const CardStatements: React.FC<CardStatementsProps> = ({ cardId }) => {
  const { t } = useTranslation('cards');
  const canDownload = useMailboxAvailability();
  const download = useStatementDownload();
  const [showAllAmounts, setShowAllAmounts] = useState(false);
  // Fixed for the page's life, so the chart's months do not shift on a re-render at midnight.
  const [today] = useState(() => new Date());
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: cardStatementsQueryKey(cardId),
    queryFn: () => getCardStatements(cardId),
  });

  if (isLoading) {
    return (
      <Stack spacing={3} aria-busy="true">
        <Skeleton variant="text" width="40%" height={48} />
        <Skeleton variant="rounded" height={SKELETON_HEIGHT} />
        <Skeleton variant="rounded" height={SKELETON_HEIGHT} />
      </Stack>
    );
  }

  if (!data) {
    const notFound = NOT_FOUND_CODES.has(apiErrorCode(error) ?? '');
    return (
      <Alert
        severity={notFound ? 'warning' : 'error'}
        action={
          notFound ? undefined : (
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              {t('history.retry')}
            </Button>
          )
        }
      >
        {t(notFound ? 'history.notFound' : 'history.loadFailed')}
      </Alert>
    );
  }

  const { card, statements } = data;
  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <PageTitle>{cardLabel(card)}</PageTitle>
        <ShowAllToggle
          showAll={showAllAmounts}
          onToggle={() => setShowAllAmounts((shown) => !shown)}
        />
      </Stack>
      <AmountVisibilityContext.Provider value={showAllAmounts}>
        <StatementTrendChart statements={statements} today={today} />
        <StatementHistoryTable
          statements={statements}
          isDownloading={download.isDownloading}
          onDownload={canDownload ? download.download : undefined}
        />
      </AmountVisibilityContext.Provider>
      <DownloadErrorSnackbar download={download} />
    </Stack>
  );
};

/** One card's last 12 months: amount due as a chart, then every statement with its download. */
export const CardStatementsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation('common');
  const { cardId = '' } = useParams();
  if (!user) return null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <BackToDashboard />
        {user.hasPan ? (
          <CardStatements cardId={cardId} />
        ) : (
          <LinkPanAlert message={t('dashboard.linkPanPrompt')} />
        )}
      </Stack>
    </Container>
  );
};
