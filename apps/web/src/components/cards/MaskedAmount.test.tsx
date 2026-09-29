import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { MaskedAmount } from './MaskedAmount';

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
});
