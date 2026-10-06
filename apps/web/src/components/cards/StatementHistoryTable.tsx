import React from 'react';
import {
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { CardStatement } from '../../services/credit-cards.api';
import { formatDate, formatMonth } from '../../utils/format';
import { MaskedAmount } from './MaskedAmount';
import { StatementFileActions } from './StatementFileActions';

/** Columns that drop out on a phone, where the month, amount due and download matter most. */
const WIDE_ONLY = { display: { xs: 'none', sm: 'table-cell' } } as const;

interface StatementHistoryTableProps {
  /** Newest first. */
  readonly statements: readonly CardStatement[];
  readonly isDownloading: boolean;
  /** Absent when mailbox features are off, since statements are fetched from the mailbox. */
  readonly onDownload?: (statementId: string) => void;
}

/** Every statement from the last 12 months, with masked amounts and a download for each. */
export const StatementHistoryTable: React.FC<StatementHistoryTableProps> = ({
  statements,
  isDownloading,
  onDownload,
}) => {
  const { t } = useTranslation('cards');
  return (
    <Paper variant="outlined">
      <Typography variant="h6" component="h2" sx={{ p: 2, pb: 1 }}>
        {t('history.listTitle')}
      </Typography>
      {statements.length === 0 ? (
        <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>
          {t('history.empty')}
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label={t('history.listTitle')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('history.month')}</TableCell>
                <TableCell sx={WIDE_ONLY}>{t('statement.statementDate')}</TableCell>
                <TableCell>{t('statement.dueBy')}</TableCell>
                <TableCell align="right">{t('statement.amountDue')}</TableCell>
                <TableCell align="right" sx={WIDE_ONLY}>
                  {t('statement.minimumDue')}
                </TableCell>
                <TableCell align="right">{t('history.statementFile')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statements.map((statement) => {
                const month = formatMonth(statement.statementDate);
                return (
                  <TableRow key={statement.id}>
                    <TableCell component="th" scope="row">
                      {month}
                    </TableCell>
                    <TableCell sx={WIDE_ONLY}>{formatDate(statement.statementDate)}</TableCell>
                    <TableCell>
                      {statement.dueDate !== null
                        ? formatDate(statement.dueDate)
                        : t('statement.noPaymentDue')}
                    </TableCell>
                    <TableCell align="right">
                      <MaskedAmount
                        value={statement.totalAmountDue}
                        label={t('history.amountDueMonth', { month })}
                      />
                    </TableCell>
                    <TableCell align="right" sx={WIDE_ONLY}>
                      {statement.minimumAmountDue !== null && (
                        <MaskedAmount
                          value={statement.minimumAmountDue}
                          label={t('history.minimumDueMonth', { month })}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {statement.downloadAvailable ? (
                        <Stack direction="row" justifyContent="flex-end">
                          <StatementFileActions
                            statement={statement}
                            month={month}
                            isDownloading={isDownloading}
                            onDownload={onDownload}
                          />
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {t('history.noPdf')}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};
