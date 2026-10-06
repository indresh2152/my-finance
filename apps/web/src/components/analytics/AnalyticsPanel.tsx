import React, { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Alert, Skeleton, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CREDIT_CARDS_QUERY_KEY,
  cardStatementsQueryKey,
  getCardStatements,
  listCreditCards,
} from '../../services/credit-cards.api';
import { ALL_MAILBOXES } from '../mailbox/MailboxFilter';
import { cardsInMailbox } from '../cards/cardPage';
import { CardsTrendChart } from './CardsTrendChart';

const SKELETON_HEIGHT = 360;

interface AnalyticsPanelProps {
  /** ALL_MAILBOXES, or the id of the mailbox whose cards to chart. */
  readonly mailboxFilter: string;
}

/** Charts the statement history of the cards in the selected email, or of every card. */
export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ mailboxFilter }) => {
  const { t } = useTranslation('cards');
  // Fixed for the panel's life, so the chart's months do not shift on a re-render at midnight.
  const [today] = useState(() => new Date());
  const cardsQuery = useQuery({ queryKey: CREDIT_CARDS_QUERY_KEY, queryFn: listCreditCards });
  const shownCards = cardsInMailbox(cardsQuery.data ?? [], mailboxFilter);
  const historyQueries = useQueries({
    queries: shownCards.map((card) => ({
      queryKey: cardStatementsQueryKey(card.id),
      queryFn: () => getCardStatements(card.id),
    })),
  });

  const failedCount = historyQueries.filter((query) => query.isError).length;
  if (cardsQuery.isError || (failedCount > 0 && failedCount === historyQueries.length)) {
    return <Alert severity="error">{t('analytics.loadFailed')}</Alert>;
  }
  if (cardsQuery.isLoading || historyQueries.some((query) => query.isLoading)) {
    return <Skeleton variant="rounded" height={SKELETON_HEIGHT} aria-busy="true" />;
  }

  // A card with no statement in the window would only add an empty line to the legend.
  const histories = historyQueries
    .flatMap((query) => query.data ?? [])
    .filter((history) => history.statements.length > 0);
  if (histories.length === 0) {
    return (
      <Alert severity="info">
        {t(mailboxFilter === ALL_MAILBOXES ? 'analytics.empty' : 'analytics.emptyFiltered')}
      </Alert>
    );
  }
  return (
    <Stack spacing={2}>
      {failedCount > 0 && (
        <Alert severity="warning">{t('analytics.someFailed', { count: failedCount })}</Alert>
      )}
      <CardsTrendChart histories={histories} today={today} />
    </Stack>
  );
};
