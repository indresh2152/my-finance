import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { CardStatement } from '../../services/credit-cards.api';
import { StatementDetails } from './StatementDetails';

const statement: CardStatement = {
  id: 'stmt-1',
  statementDate: '2026-09-05',
  dueDate: '2026-09-25',
  totalAmountDue: 12345.67,
  minimumAmountDue: 620,
  passwordHint: 'First 4 letters of your name + DDMM',
  downloadAvailable: true,
};

interface RenderOptions {
  readonly canDownload?: boolean;
  readonly isDownloading?: boolean;
}

const renderDetails = (
  value: CardStatement | null = statement,
  { canDownload = true, isDownloading = false }: RenderOptions = {},
): ReturnType<typeof vi.fn> => {
  const onDownload = vi.fn();
  renderWithProviders(
    <StatementDetails
      statement={value}
      isDownloading={isDownloading}
      onDownload={canDownload ? onDownload : undefined}
    />,
  );
  return onDownload;
};

describe('StatementDetails', () => {
  it('should show masked amounts and the due and statement dates', () => {
    renderDetails();
    expect(screen.getByText('Amount due')).toBeInTheDocument();
    expect(screen.getByText('Minimum due')).toBeInTheDocument();
    expect(screen.getAllByText('₹ ••••••')).toHaveLength(2);
    expect(screen.getByText(/^25 Sept? 2026$/)).toBeInTheDocument();
    expect(screen.getByText(/^05 Sept? 2026$/)).toBeInTheDocument();
  });

  it('should leave out the minimum due when the email had none', () => {
    renderDetails({ ...statement, minimumAmountDue: null });
    expect(screen.queryByText('Minimum due')).not.toBeInTheDocument();
  });

  it('should download the statement', async () => {
    const onDownload = renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Download statement' }));
    expect(onDownload).toHaveBeenCalledWith('stmt-1');
  });

  it('should disable the button while downloading', () => {
    renderDetails(statement, { isDownloading: true });
    expect(screen.getByRole('button', { name: 'Download statement' })).toBeDisabled();
  });

  it.each([
    ['the email had no PDF', { ...statement, downloadAvailable: false }, {}],
    ['mailbox features are off', statement, { canDownload: false }],
  ])('should hide the download button when %s', (_case, value, options) => {
    renderDetails(value, options);
    expect(screen.queryByRole('button', { name: 'Download statement' })).not.toBeInTheDocument();
  });

  it('should show the password hint on hover', async () => {
    renderDetails();
    await userEvent.hover(screen.getByRole('button', { name: 'Statement password hint' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'First 4 letters of your name + DDMM',
    );
  });

  it('should say when the email had no password hint', async () => {
    renderDetails({ ...statement, passwordHint: null });
    await userEvent.hover(screen.getByRole('button', { name: 'Statement password hint' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'No password hint found in the email',
    );
  });

  it('should say when no statement has been found', () => {
    renderDetails(null);
    expect(screen.getByText('No statement found yet')).toBeInTheDocument();
  });
});
