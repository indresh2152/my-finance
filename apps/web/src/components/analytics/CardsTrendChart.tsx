import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { axisClasses } from '@mui/x-charts/ChartsAxis';
import { LineChart } from '@mui/x-charts/LineChart';
import { useTranslation } from 'react-i18next';
import type { CardStatementHistory } from '../../services/credit-cards.api';
import { useAmountReveal } from '../../hooks/useAmountReveal';
import { formatInr, formatInrCompact, formatMonth } from '../../utils/format';
import { amountTicks, fromAxis, toAxis } from './amountTicks';
import { cardLabel } from '../cards/cardPage';
import { monthlyAmounts } from '../cards/statementMonths';
import { MASKED_SX, RevealButton } from '../cards/RevealButton';

const CHART_HEIGHT = 440;
/** One colour per card, repeating after ten; set on each series so the legend reads it back. */
const LINE_COLORS = [
  '#1976d2',
  '#d32f2f',
  '#2e7d32',
  '#ed6c02',
  '#7b1fa2',
  '#0097a7',
  '#c2185b',
  '#5d4037',
  '#689f38',
  '#455a64',
];

/** Cards of one bank with no digits or name share a label; number the repeats to tell them apart. */
const uniqueLabels = (labels: readonly string[]): string[] => {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return labels.filter((other) => other === label).length > 1 ? `${label} (${count})` : label;
  });
};

/** Moves each axis label clear of the tick values beside it. */
const AXIS_LABEL_SX = {
  [`& .${axisClasses.left} .${axisClasses.label}`]: { transform: 'translateX(-20px)' },
  [`& .${axisClasses.bottom} .${axisClasses.label}`]: { transform: 'translateY(16px)' },
} as const;

interface CardsTrendChartProps {
  readonly histories: readonly CardStatementHistory[];
  /** The last month shown; the chart covers it and the 11 before it. */
  readonly today: Date;
}

/**
 * Amount due per month over the last 12 months, one line per card. Like the single-card chart, the
 * lines always show but the rupee values on the axis and in the tooltip stay masked (and are never
 * rendered) until revealed. Months without a statement are gaps, not zeros.
 */
export const CardsTrendChart: React.FC<CardsTrendChartProps> = ({ histories, today }) => {
  const { t } = useTranslation('cards');
  const { isRevealed, toggle } = useAmountReveal();
  const title = t('analytics.chartTitle');
  const masked = t('amount.masked');
  const amountsByCard = histories.map(({ statements }) => monthlyAmounts(statements, today));
  const months = (amountsByCard[0] ?? []).map(({ month }) => month);
  const ticks = amountTicks(
    Math.max(0, ...amountsByCard.flatMap((amounts) => amounts.map(({ amount }) => amount ?? 0))),
  );
  // The lines are drawn at toAxis(amount) on a linear axis; the formatters turn positions back
  // into rupees, so the labels and tooltips show real amounts.
  const labels = uniqueLabels(histories.map(({ card }) => cardLabel(card)));
  const series = histories.map(({ card }, index) => ({
    id: card.id,
    label: labels[index] ?? cardLabel(card),
    color: LINE_COLORS[index % LINE_COLORS.length],
    data: (amountsByCard[index] ?? []).map(({ amount }) =>
      amount === null ? null : toAxis(amount),
    ),
    // Marks keep a lone month between gaps visible; a line needs two neighbours.
    showMark: true,
    valueFormatter: (position: number | null) => {
      if (position === null) return t('history.noStatement');
      return isRevealed ? formatInr(fromAxis(position)) : masked;
    },
  }));

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
        aria-label={t('analytics.chartLabel')}
        sx={
          isRevealed ? undefined : { '& .MuiChartsAxis-left .MuiChartsAxis-tickLabel': MASKED_SX }
        }
      >
        <LineChart
          height={CHART_HEIGHT}
          margin={{ left: 85, right: 40, top: 20, bottom: 60 }}
          xAxis={[
            {
              scaleType: 'point',
              data: months,
              valueFormatter: formatMonth,
              label: t('analytics.xAxisLabel'),
            },
          ]}
          yAxis={[
            {
              min: 0,
              max: toAxis(ticks[ticks.length - 1] ?? 0),
              tickInterval: ticks.map(toAxis),
              label: t('analytics.yAxisLabel'),
              valueFormatter: (value: number) =>
                isRevealed ? formatInrCompact(fromAxis(value)) : masked,
            },
          ]}
          series={series}
          sx={AXIS_LABEL_SX}
          slotProps={{ legend: { hidden: true } }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" align="center">
        {t('analytics.scaleNote')}
      </Typography>
      {/* Drawn here, not by the chart, so it centres under the whole card and wraps. */}
      <Box
        component="ul"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 1,
          columnGap: 2.5,
          listStyle: 'none',
          m: 0,
          mt: 3,
          p: 0,
        }}
      >
        {series.map((line) => (
          <Box
            component="li"
            key={line.id}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
          >
            <Box
              aria-hidden
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: line.color,
              }}
            />
            <Typography variant="body2">{line.label}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
};
