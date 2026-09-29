import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SyncProgressBanner } from './SyncProgressBanner';

describe('SyncProgressBanner', () => {
  it('should tell the user details are being gathered and where they will appear', () => {
    renderWithProviders(<SyncProgressBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Gathering your card and account details…');
    expect(banner).toHaveTextContent(
      'This can take a few minutes. Cards we find will appear under Credit Cards.',
    );
  });
});
