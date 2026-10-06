import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { CardStatement } from '../../services/credit-cards.api';
import { formatDate } from '../../utils/format';
import { MaskedAmount } from './MaskedAmount';
import { StatementFileActions } from './StatementFileActions';

interface DetailRowProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

/** A caption label on the left, its value on the right. */
export const DetailRow: React.FC<DetailRowProps> = ({ label, children }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    {children}
  </Box>
);

interface StatementDetailsProps {
  readonly statement: CardStatement | null;
  readonly isDownloading: boolean;
  /** Absent when mailbox features are off, since the file is fetched from the mailbox. */
  readonly onDownload?: (statementId: string) => void;
}

/** The card's latest statement from email: masked amounts, dates, download and password hint. */
export const StatementDetails: React.FC<StatementDetailsProps> = ({
  statement,
  isDownloading,
  onDownload,
}) => {
  const { t } = useTranslation('cards');
  const amountDue = t('statement.amountDue');
  const minimumDue = t('statement.minimumDue');

  if (!statement) {
    return (
      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
        {t('statement.none')}
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} mt={1.5}>
      <DetailRow label={amountDue}>
        <MaskedAmount value={statement.totalAmountDue} label={amountDue} />
      </DetailRow>
      {statement.minimumAmountDue !== null && (
        <DetailRow label={minimumDue}>
          <MaskedAmount value={statement.minimumAmountDue} label={minimumDue} />
        </DetailRow>
      )}
      <DetailRow label={t('statement.dueBy')}>
        <Typography variant="caption" fontWeight={600}>
          {statement.dueDate !== null ? formatDate(statement.dueDate) : t('statement.noPaymentDue')}
        </Typography>
      </DetailRow>
      <DetailRow label={t('statement.statementDate')}>
        <Typography variant="caption">{formatDate(statement.statementDate)}</Typography>
      </DetailRow>
      <StatementFileActions
        statement={statement}
        isDownloading={isDownloading}
        onDownload={onDownload}
      />
    </Stack>
  );
};
