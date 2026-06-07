import { screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { CreditCardsPage } from './CreditCardsPage';
import { AuthProvider } from '../context/AuthContext';

const mockCard = {
  id: 'card-1',
  cardNumberLast4: '4242',
  cardNetwork: 'VISA',
  issuingBank: 'HDFC Bank',
  cardVariant: 'PLATINUM',
  expiryMonth: 12,
  expiryYear: 2027,
  nameOnCard: 'Test User',
  status: 'ACTIVE',
  creditLimit: 500000,
  availableCredit: 350000,
  currentBalance: 150000,
};

const server = setupServer(
  http.post('/api/v1/auth/refresh', () =>
    HttpResponse.json({ accessToken: 'token' }),
  ),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({ id: '1', username: 'u', email: 'e@e.com', hasPan: true, panMasked: 'ABCDE####F' }),
  ),
  http.get('/api/v1/credit-cards', () =>
    HttpResponse.json({ cards: [mockCard] }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderPage = (): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <CreditCardsPage />
    </AuthProvider>,
  );

describe('CreditCardsPage', () => {
  it('should render the page title', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Credit Cards')).toBeInTheDocument());
  });

  it('should display a credit card with bank name and last 4 digits', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('HDFC Bank')).toBeInTheDocument());
    expect(screen.getByText(/4242/)).toBeInTheDocument();
  });

  it('should display credit limit formatted in INR', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/5,00,000/)).toBeInTheDocument());
  });

  it('should show the empty state when no cards are returned', async () => {
    server.use(http.get('/api/v1/credit-cards', () => HttpResponse.json({ cards: [] })));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('No credit cards linked to this PAN yet.')).toBeInTheDocument(),
    );
  });

  it('should show error alert when API fails', async () => {
    server.use(http.get('/api/v1/credit-cards', () => new HttpResponse(null, { status: 500 })));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Failed to load credit cards. Please try again.')).toBeInTheDocument(),
    );
  });
});
