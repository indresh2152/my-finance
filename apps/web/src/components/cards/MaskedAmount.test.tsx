import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AmountVisibilityContext } from '../../context/AmountVisibilityContext';
import { MaskedAmount } from './MaskedAmount';

const withShowAll = (showAll: boolean): React.ReactElement => (
  <AmountVisibilityContext.Provider value={showAll}>
    <MaskedAmount value={10} label="Amount due" />
  </AmountVisibilityContext.Provider>
);

describe('MaskedAmount', () => {
  it('should keep the real value out of the page until revealed', async () => {
    const { container } = renderWithProviders(<MaskedAmount value={12345.67} label="Amount due" />);
    expect(screen.getByText('₹ ••••••')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/12,345/);

    await userEvent.click(screen.getByRole('button', { name: 'Show Amount due' }));
    expect(screen.getByText('₹12,345.67')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide Amount due' }));
    expect(container.textContent).not.toMatch(/12,345/);
  });

  it('should be masked again when shown anew', async () => {
    const { unmount } = renderWithProviders(<MaskedAmount value={10} label="Amount due" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show Amount due' }));
    unmount();
    renderWithProviders(<MaskedAmount value={10} label="Amount due" />);
    expect(screen.getByText('₹ ••••••')).toBeInTheDocument();
  });

  it('should start revealed when the page shows all amounts', () => {
    renderWithProviders(withShowAll(true));
    expect(screen.getByText('₹10.00')).toBeInTheDocument();
  });

  it('should follow the show-all switch each time it flips, and still toggle on its own', async () => {
    const { rerender } = renderWithProviders(withShowAll(false));
    rerender(withShowAll(true));
    expect(screen.getByText('₹10.00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide Amount due' }));
    expect(screen.getByText('₹ ••••••')).toBeInTheDocument();

    rerender(withShowAll(false));
    expect(screen.getByText('₹ ••••••')).toBeInTheDocument();
    rerender(withShowAll(true));
    expect(screen.getByText('₹10.00')).toBeInTheDocument();
  });
});
