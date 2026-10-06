import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AmountVisibilityContext } from '../../context/AmountVisibilityContext';
import type { CardStatement } from '../../services/credit-cards.api';
import { StatementTrendChart } from './StatementTrendChart';

interface ChartProps {
  xAxis: { data: string[]; valueFormatter: (v: string) => string }[];
  yAxis: { valueFormatter: (v: number) => string }[];
  series: { data: (number | null)[]; valueFormatter: (v: number | null) => string }[];
}

/**
 * jsdom cannot lay out SVG, so the chart is replaced by one that prints what the real chart would
 * show: each month's axis label and tooltip text, and an axis tick.
 */
vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ xAxis, yAxis, series }: ChartProps): React.ReactElement => (
    <ul>
      {xAxis[0]?.data.map((month, i) => (
        <li key={month}>
          {xAxis[0]?.valueFormatter(month)}: {series[0]?.valueFormatter(series[0].data[i] ?? null)}
        </li>
      ))}
      <li>tick: {yAxis[0]?.valueFormatter(150000)}</li>
    </ul>
  ),
}));

const statement: CardStatement = {
  id: 'stmt-1',
  statementDate: '2026-09-05',
  dueDate: '2026-09-25',
  totalAmountDue: 12345.67,
  minimumAmountDue: null,
  passwordHint: null,
  downloadAvailable: true,
};
const TODAY = new Date('2026-10-06T00:00:00Z');

const renderChart = (showAll = false): void => {
  renderWithProviders(
    <AmountVisibilityContext.Provider value={showAll}>
      <StatementTrendChart statements={[statement]} today={TODAY} />
    </AmountVisibilityContext.Provider>,
  );
};

describe('StatementTrendChart', () => {
  it('should hide every amount until revealed, keeping the months', () => {
    renderChart();
    expect(screen.getByRole('heading', { name: 'Amount due, last 12 months' })).toBeInTheDocument();
    expect(screen.getByText(/^Sept? 2026: ₹ ••••••$/)).toBeInTheDocument();
    expect(screen.getByText('tick: ₹ ••••••')).toBeInTheDocument();
    expect(screen.queryByText(/12,345/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\.5L/)).not.toBeInTheDocument();
  });

  it('should show amounts and compact axis ticks once the eye button is pressed', async () => {
    renderChart();
    await userEvent.click(screen.getByRole('button', { name: 'Show Amount due, last 12 months' }));
    expect(screen.getByText(/^Sept? 2026: ₹12,345\.67$/)).toBeInTheDocument();
    expect(screen.getByText('tick: ₹1.5L')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide Amount due, last 12 months' }));
    expect(screen.queryByText(/12,345/)).not.toBeInTheDocument();
  });

  it("should follow the page's show-all switch", () => {
    renderChart(true);
    expect(screen.getByText(/^Sept? 2026: ₹12,345\.67$/)).toBeInTheDocument();
  });

  it('should mark months without a statement rather than show zero', () => {
    renderChart(true);
    expect(screen.getByText('Aug 2026: No statement')).toBeInTheDocument();
    expect(screen.getByText('Nov 2025: No statement')).toBeInTheDocument();
  });
});
