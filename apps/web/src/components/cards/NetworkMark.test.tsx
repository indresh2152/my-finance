import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { NetworkMark } from './NetworkMark';

describe('NetworkMark', () => {
  it.each([
    ['VISA', 'VISA'],
    ['RUPAY', 'RuPay'],
    ['AMEX', 'AMEX'],
    ['DINERS', 'Diners Club'],
  ])('should show the %s wordmark', (network, text) => {
    renderWithProviders(<NetworkMark network={network} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('should draw the Mastercard circles as a labelled image', () => {
    renderWithProviders(<NetworkMark network="MASTERCARD" />);
    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeInTheDocument();
  });

  it.each([null, 'OTHER'])('should show nothing for network %s', (network) => {
    const { container } = renderWithProviders(<NetworkMark network={network} />);
    expect(container).toBeEmptyDOMElement();
  });
});
