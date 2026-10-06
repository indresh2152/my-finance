import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { useTranslation } from 'react-i18next';
import type { CardStatement } from '../../services/credit-cards.api';
import { useAmountReveal } from '../../hooks/useAmountReveal';
import { formatInr, formatInrCompact, formatMonth } from '../../utils/format';
import { monthlyAmounts } from './statementMonths';
import { MASKED_SX, RevealButton } from './RevealButton';

const CHART_HEIGHT = 280;

interface StatementTrendChartProps {
  readonly statements: readonly CardStatement[];
  /** The last month shown; the chart covers it and the 11 months before. */
  readonly today: Date;
}

/**
 * Amount due per month over the last 12 months. The line's shape always shows; the rupee values on
 * the axis and in the tooltip are masked (and never rendered) until revealed with the eye button,
 * which also follows the page's show-all switch. Months without a statement are gaps, not zeros.
 */
export const StatementTrendChart: React.FC<StatementTrendChartProps> = ({ statements, today }) => {
  const { t } = useTranslation('cards');
  const { isRevealed, toggle } = useAmountReveal();
  const months = monthlyAmounts(statements, today);
  const title = t('history.chartTitle');
  const masked = t('amount.masked');

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        <RevealButton isRevealed={isRevealed} onToggle={toggle} label={title} />
      </Stack>
      <Box
        role="img"
        aria-label={t('history.chartLabel')}
        sx={
          isRevealed ? undefined : { '& .MuiChartsAxis-left .MuiChartsAxis-tickLabel': MASKED_SX }
        }
      >
        <LineChart
          height={CHART_HEIGHT}
          margin={{ left: 70, right: 20, top: 20, bottom: 30 }}
          xAxis={[
            { scaleType: 'point', data: months.map((m) => m.month), valueFormatter: formatMonth },
          ]}
          yAxis={[
            {
              min: 0,
              valueFormatter: (value: number) => (isRevealed ? formatInrCompact(value) : masked),
            },
          ]}
          series={[
            {
              data: months.map((m) => m.amount),
              label: t('statement.amountDue'),
              // Marks keep a lone month between gaps visible; a line needs two neighbours.
              showMark: true,
              valueFormatter: (value: number | null) => {
                if (value === null) return t('history.noStatement');
                return isRevealed ? formatInr(value) : masked;
              },
            },
          ]}
          slotProps={{ legend: { hidden: true } }}
        />
      </Box>
    </Paper>
  );
};
