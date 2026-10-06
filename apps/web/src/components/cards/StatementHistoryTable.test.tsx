import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { CardStatement } from '../../services/credit-cards.api';
import { StatementHistoryTable } from './StatementHistoryTable';

const september: CardStatement = {
  id: 'stmt-sep',
  statementDate: '2026-09-05',
  dueDate: '2026-09-25',
  totalAmountDue: 12345.67,
  minimumAmountDue: 620,
  passwordHint: 'First 4 letters of your name + DDMM',
  downloadAvailable: true,
};
const august: CardStatement = {
  ...september,
  id: 'stmt-aug',
  statementDate: '2026-08-05',
  dueDate: null,
  totalAmountDue: 0,
  minimumAmountDue: null,
  passwordHint: null,
  downloadAvailable: false,
};

interface RenderOptions {
  readonly canDownload?: boolean;
  readonly isDownloading?: boolean;
}

const renderTable = (
  statements: CardStatement[] = [september, august],
  { canDownload = true, isDownloading = false }: RenderOptions = {},
): ReturnType<typeof vi.fn> => {
  const onDownload = vi.fn();
  renderWithProviders(
    <StatementHistoryTable
      statements={statements}
      isDownloading={isDownloading}
      onDownload={canDownload ? onDownload : undefined}
    />,
  );
  return onDownload;
};

const rowFor = (month: RegExp): HTMLElement => {
  const row = screen.getByRole('rowheader', { name: month }).closest('tr');
  if (!row) throw new Error('no row');
  return row;
};

describe('StatementHistoryTable', () => {
  it('should list each statement with its dates and masked amounts', () => {
    renderTable();
    const row = rowFor(/^Sept? 2026$/);
    expect(within(row).getByText(/^25 Sept? 2026$/)).toBeInTheDocument();
    expect(within(row).getAllByText('₹ ••••••')).toHaveLength(2);
    expect(screen.queryByText(/12,345/)).not.toBeInTheDocument();
    expect(within(rowFor(/^Aug 2026$/)).getByText('No payment due')).toBeInTheDocument();
  });

  it('should reveal one amount on its own', async () => {
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: /^Show Amount due, Sept? 2026$/ }));
    expect(screen.getByText('₹12,345.67')).toBeInTheDocument();
  });

  it("should download a month's statement", async () => {
    const onDownload = renderTable();
    await userEvent.click(screen.getByRole('button', { name: /^Download Sept? 2026 statement$/ }));
    expect(onDownload).toHaveBeenCalledWith('stmt-sep');
  });

  it('should say when a statement email had no PDF', () => {
    renderTable();
    const row = rowFor(/^Aug 2026$/);
    expect(within(row).getByText('No PDF in email')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('should disable downloads while one runs', () => {
    renderTable([september], { isDownloading: true });
    expect(screen.getByRole('button', { name: /^Download Sept? 2026 statement$/ })).toBeDisabled();
  });

  it('should offer no download when mailbox features are off, but keep the password hint', () => {
    renderTable([september], { canDownload: false });
    expect(screen.queryByRole('button', { name: /^Download/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Password hint for the Sept? 2026 statement$/ }),
    ).toBeInTheDocument();
  });

  it('should say when there are no statements', () => {
    renderTable([]);
    expect(screen.getByText('No statements found in the last 12 months.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
