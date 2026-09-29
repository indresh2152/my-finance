import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { CreditCardsPage } from './CreditCardsPage';
import { AuthProvider } from '../context/AuthContext';
import { SYNC_POLL_INTERVAL_MS, type Mailbox } from '../services/mailbox.api';
import type { CreditCard } from '../services/credit-cards.api';

const GATHERING = 'Gathering your card and account details…';
const NO_MAILBOX = 'No mailbox linked yet.';

vi.mock('../services/navigation', () => ({ redirectTo: vi.fn() }));

const mockCard: CreditCard = {
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

const emailCard: CreditCard = {
  ...mockCard,
  id: 'card-2',
  cardNumberLast4: '9876',
  issuingBank: 'ICICI Bank',
  cardNetwork: null,
  expiryMonth: null,
  expiryYear: null,
  nameOnCard: null,
  creditLimit: null,
};

const mailbox = (overrides: Partial<Mailbox> = {}): Mailbox => ({
  id: 'mb-1',
  provider: 'GOOGLE',
  emailMasked: 'us****@gmail.com',
  status: 'ACTIVE',
  lastSyncStatus: 'SUCCEEDED',
  lastSyncErrorCode: null,
  lastSyncedAt: '2026-09-26T08:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  ...overrides,
});

let cards: CreditCard[] = [];
let cardRequests = 0;
let mailboxes: Mailbox[] = [];
const server = setupServer(
  http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({
      id: '1',
      username: 'u',
      email: 'e@e.com',
      hasPan: true,
      panMasked: 'ABCDE####F',
    }),
  ),
  http.get('/api/v1/credit-cards', () => {
    cardRequests += 1;
    return HttpResponse.json({ cards });
  }),
  http.get('/api/v1/mailboxes', () => HttpResponse.json({ mailboxes })),
  http.post('/api/v1/mailboxes/:id/sync', () =>
    HttpResponse.json({ queued: true }, { status: 202 }),
  ),
  http.delete('/api/v1/mailboxes/:id', () => {
    mailboxes = [];
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  cards = [mockCard];
  cardRequests = 0;
  mailboxes = [mailbox()];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const LocationProbe = (): ReactElement => <div data-testid="search">{useLocation().search}</div>;

const renderPage = (path = '/credit-cards'): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <CreditCardsPage />
      <LocationProbe />
    </AuthProvider>,
    { initialEntries: [path] },
  );

describe('CreditCardsPage — cards', () => {
  it('should render the page title', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Credit Cards' })).toBeInTheDocument();
  });

  it('should display a credit card with bank, network, last 4 digits and expiry', async () => {
    renderPage();
    expect(await screen.findByText('HDFC Bank')).toBeInTheDocument();
    expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.getByText(/12\/2027/)).toBeInTheDocument();
  });

  it('should display credit limit formatted in INR', async () => {
    renderPage();
    expect(await screen.findByText(/5,00,000/)).toBeInTheDocument();
  });

  it('should leave out details a bank email did not reveal', async () => {
    cards = [emailCard];
    renderPage();
    expect(await screen.findByText('ICICI Bank')).toBeInTheDocument();
    expect(screen.getByText('•••• 9876')).toBeInTheDocument();
    expect(screen.queryByText(/Expires/)).not.toBeInTheDocument();
    expect(screen.queryByText('Credit Limit')).not.toBeInTheDocument();
    expect(screen.queryByText(/null|—/)).not.toBeInTheDocument();
  });

  it('should show the empty state with a link to link an email', async () => {
    cards = [];
    mailboxes = [];
    renderPage();
    expect(await screen.findByText('No credit cards yet.')).toBeInTheDocument();
    const emptyState = screen.getByRole('alert');
    await userEvent.click(within(emptyState).getByRole('button', { name: 'Link email' }));
    expect(await screen.findByRole('dialog', { name: 'Link a mailbox' })).toBeInTheDocument();
  });

  it('should not ask to link an email again when a mailbox is already linked', async () => {
    cards = [];
    renderPage();
    expect(
      await screen.findByText(/haven't found any credit cards in your linked email yet/),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('alert')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('should show error alert when API fails', async () => {
    server.use(http.get('/api/v1/credit-cards', () => new HttpResponse(null, { status: 500 })));
    renderPage();
    expect(
      await screen.findByText('Failed to load credit cards. Please try again.'),
    ).toBeInTheDocument();
  });
});

describe('CreditCardsPage — link email', () => {
  it('should open the link mailbox dialog with the email field focused', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Link email' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link a mailbox' });
    expect(within(dialog).getByLabelText('Email address')).toHaveFocus();
    expect(within(dialog).getByText(/We only read emails from your banks/)).toBeInTheDocument();
  });

  it('should close the link mailbox dialog', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Link email' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link a mailbox' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('should open the link mailbox dialog to reconnect a mailbox whose access expired', async () => {
    mailboxes = [mailbox({ status: 'REAUTH_REQUIRED' })];
    renderPage();
    expect(
      await screen.findByText('Access expired. Reconnect to keep syncing.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link a mailbox' });
    expect(within(dialog).getByLabelText('Email address')).toHaveFocus();
  });

  it('should show a success notice after linking and strip the flag from the URL', async () => {
    renderPage('/credit-cards?linked=1');
    expect(await screen.findByText('Mailbox linked.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''));
  });

  it('should show the translated error after a failed link', async () => {
    renderPage('/credit-cards?error=MAILBOX_EMAIL_MISMATCH');
    expect(await screen.findByText(/signed in with a different account/)).toBeInTheDocument();
  });

  it('should fall back to a generic message for an unknown error code', async () => {
    renderPage('/credit-cards?error=SOMETHING_ELSE');
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });
});

describe('CreditCardsPage — linked mailboxes', () => {
  it('should hide mailbox linking when the server has it turned off', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 404 })));
    cards = [];
    renderPage();
    expect(await screen.findByText('No credit cards yet.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Linked mailboxes')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Link email' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load your linked mailboxes/)).not.toBeInTheDocument();
  });

  it('should show that no mailbox is linked', async () => {
    mailboxes = [];
    renderPage();
    expect(await screen.findByText(NO_MAILBOX)).toBeInTheDocument();
  });

  it('should list linked mailboxes with provider and last sync time', async () => {
    renderPage();
    expect(await screen.findByText('us****@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    expect(screen.queryByText(GATHERING)).not.toBeInTheDocument();
  });

  it('should show syncing, failed and never-synced states', async () => {
    mailboxes = [
      mailbox({ id: 'a', emailMasked: 'a****@gmail.com', lastSyncStatus: 'RUNNING' }),
      mailbox({
        id: 'b',
        emailMasked: 'b****@outlook.com',
        provider: 'MICROSOFT',
        lastSyncStatus: 'FAILED',
      }),
      mailbox({
        id: 'c',
        emailMasked: 'c****@gmail.com',
        lastSyncStatus: 'NEVER',
        lastSyncedAt: null,
      }),
    ];
    renderPage();
    expect(await screen.findByText('Syncing…')).toBeInTheDocument();
    expect(screen.getByText('Last sync failed')).toBeInTheDocument();
    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
    const syncingRow = screen.getByText('a****@gmail.com').closest('li') as HTMLElement;
    expect(within(syncingRow).getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('should show an error when mailboxes fail to load', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 500 })));
    renderPage();
    expect(
      // Server errors (unlike a 404) are retried once, after react-query's 1 s delay.
      await screen.findByText(
        'Failed to load your linked mailboxes. Please try again.',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
  });

  it('should explain when a sync was requested too soon', async () => {
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', () =>
        HttpResponse.json({ error: { code: 'SYNC_TOO_FREQUENT', message: 'x' } }, { status: 429 }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(
      await screen.findByText('This mailbox was synced recently. Try again in a few minutes.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(GATHERING)).not.toBeInTheDocument();
  });

  it('should explain when the mailbox is no longer linked', async () => {
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', () =>
        HttpResponse.json({ error: { code: 'MAILBOX_NOT_FOUND', message: 'x' } }, { status: 404 }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('This mailbox is no longer linked.')).toBeInTheDocument();
  });

  it('should unlink after confirmation and refresh the card list', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Unlink us****@gmail.com?')).toBeInTheDocument();
    const requestsBefore = cardRequests;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByText(NO_MAILBOX)).toBeInTheDocument();
    await waitFor(() => expect(cardRequests).toBeGreaterThan(requestsBefore));
  });

  it('should show the Microsoft consent note when unlinking a Microsoft mailbox', async () => {
    mailboxes = [mailbox({ provider: 'MICROSOFT', emailMasked: 'us****@outlook.com' })];
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/app permissions in your Microsoft account/),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('should show an error when unlinking fails', async () => {
    server.use(http.delete('/api/v1/mailboxes/:id', () => new HttpResponse(null, { status: 500 })));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });
});

describe('CreditCardsPage — gathering progress', () => {
  it('should show the progress banner while a mailbox has not finished its first sync', async () => {
    mailboxes = [
      mailbox({ lastSyncStatus: 'NEVER', lastSyncedAt: null, createdAt: new Date().toISOString() }),
    ];
    renderPage();
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('should let the user retry a first sync that never started', async () => {
    mailboxes = [mailbox({ lastSyncStatus: 'NEVER', lastSyncedAt: null })];
    renderPage();
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.queryByText(GATHERING)).not.toBeInTheDocument();
  });

  it('should not show the progress banner for a mailbox whose access expired', async () => {
    mailboxes = [mailbox({ status: 'REAUTH_REQUIRED', lastSyncStatus: 'NEVER' })];
    renderPage();
    expect(await screen.findByText('us****@gmail.com')).toBeInTheDocument();
    expect(screen.queryByText(GATHERING)).not.toBeInTheDocument();
  });

  it('should show the progress banner after refreshing a mailbox whose last sync failed', async () => {
    mailboxes = [mailbox({ lastSyncStatus: 'FAILED' })];
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
  });

  it('should reload the cards when a sync fails after saving some of them', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      cards = [];
      mailboxes = [
        mailbox({
          lastSyncStatus: 'NEVER',
          lastSyncedAt: null,
          createdAt: new Date().toISOString(),
        }),
      ];
      renderPage();
      expect(await screen.findByText(GATHERING)).toBeInTheDocument();

      cards = [emailCard];
      mailboxes = [mailbox({ lastSyncStatus: 'FAILED', lastSyncedAt: null })];
      await vi.advanceTimersByTimeAsync(SYNC_POLL_INTERVAL_MS);
      expect(await screen.findByText('ICICI Bank')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should show the banner after Refresh until the sync has run, then reload the cards', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mailboxes = [mailbox({ lastSyncedAt: '2020-01-01T00:00:00Z' })];
      renderPage();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(await screen.findByRole('button', { name: 'Refresh' }));
      expect(await screen.findByText(GATHERING)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

      cards = [mockCard, emailCard];
      mailboxes = [mailbox({ lastSyncedAt: new Date(Date.now() + 60_000).toISOString() })];
      await vi.advanceTimersByTimeAsync(SYNC_POLL_INTERVAL_MS);
      await waitFor(() => expect(screen.queryByText(GATHERING)).not.toBeInTheDocument());
      expect(await screen.findByText('ICICI Bank')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
