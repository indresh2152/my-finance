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
import type { EmailAccount } from '../services/accounts.api';

const GATHERING = 'Gathering your card and account details…';
const NO_MAILBOX = 'No mailbox linked yet.';

vi.mock('../services/navigation', () => ({ redirectTo: vi.fn() }));

const mockCard: CreditCard = {
  id: 'card-1',
  cardNumberLast4: '4242',
  cardName: null,
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
  latestStatement: null,
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

const statementCard: CreditCard = {
  ...emailCard,
  latestStatement: {
    id: 'stmt-1',
    statementDate: '2026-09-05',
    dueDate: '2026-09-25',
    totalAmountDue: 12345.67,
    minimumAmountDue: null,
    passwordHint: null,
    downloadAvailable: true,
  },
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

const emailAccount: EmailAccount = {
  id: 'acc-1',
  bankName: 'KOTAK',
  accountNumberLast4: '7890',
  accountType: 'SAVINGS',
  availableBalance: 234567.89,
  balanceAsOf: '2026-09-24T10:12:00.000Z',
};

/** The alert holding `text`; the page may show several (cards and accounts). */
const alertWith = (text: string | RegExp): HTMLElement => {
  const alert = screen.getByText(text).closest<HTMLElement>('[role="alert"]');
  if (!alert) throw new Error('no alert around the text');
  return alert;
};

let cards: CreditCard[] = [];
let cardRequests = 0;
let accounts: EmailAccount[] = [];
let accountRequests = 0;
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
  http.get('/api/v1/mailboxes/accounts', () => {
    accountRequests += 1;
    return HttpResponse.json({ data: accounts });
  }),
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
  accounts = [];
  accountRequests = 0;
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

  it("should show a card's name before its digits", async () => {
    cards = [{ ...emailCard, cardName: 'Amazon Pay' }];
    renderPage();
    expect(await screen.findByText('Amazon Pay •••• 9876')).toBeInTheDocument();
  });

  it('should name a card whose bank emails never show its digits', async () => {
    cards = [{ ...emailCard, issuingBank: 'HDFC', cardNumberLast4: null, cardName: 'Pixel Play' }];
    renderPage();
    expect(await screen.findByText('Pixel Play')).toBeInTheDocument();
    expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
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

  it('should show the empty state without a second Link email link', async () => {
    cards = [];
    mailboxes = [];
    renderPage();
    expect(await screen.findByText('No credit cards yet.')).toBeInTheDocument();
    expect(within(alertWith('No credit cards yet.')).queryByRole('button')).not.toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: 'Link email' })).toHaveLength(1);
  });

  it('should not ask to link an email again when a mailbox is already linked', async () => {
    cards = [];
    renderPage();
    const found = /haven't found any credit cards in your linked email yet/;
    expect(await screen.findByText(found)).toBeInTheDocument();
    expect(within(alertWith(found)).queryByRole('button')).not.toBeInTheDocument();
  });

  it('should show error alert when API fails', async () => {
    server.use(http.get('/api/v1/credit-cards', () => new HttpResponse(null, { status: 500 })));
    renderPage();
    expect(
      await screen.findByText('Failed to load credit cards. Please try again.'),
    ).toBeInTheDocument();
  });
});

describe('CreditCardsPage — bank accounts', () => {
  it('should show each account with its balance masked and the date it was reported', async () => {
    accounts = [emailAccount];
    const { container } = renderPage();
    const section = await screen.findByRole('region', { name: 'Bank accounts' });
    expect(await within(section).findByText('KOTAK')).toBeInTheDocument();
    expect(within(section).getByText('•••• 7890')).toBeInTheDocument();
    expect(within(section).getByText('Savings')).toBeInTheDocument();
    expect(within(section).getByText(/^as of 24 Sept? 2026$/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/2,34,567/);

    await userEvent.click(within(section).getByRole('button', { name: 'Show Available balance' }));
    expect(within(section).getByText('₹2,34,567.89')).toBeInTheDocument();
  });

  it('should leave out the type chip when the email did not say', async () => {
    accounts = [{ ...emailAccount, accountType: 'OTHER' }];
    renderPage();
    const section = await screen.findByRole('region', { name: 'Bank accounts' });
    expect(await within(section).findByText('KOTAK')).toBeInTheDocument();
    expect(within(section).queryByText('Savings')).not.toBeInTheDocument();
    expect(within(section).queryByText(/other/i)).not.toBeInTheDocument();
  });

  it('should report that none were found when a mailbox is linked', async () => {
    renderPage();
    const section = await screen.findByRole('region', { name: 'Bank accounts' });
    expect(
      await within(section).findByText(/haven't found any bank accounts in your linked email yet/),
    ).toBeInTheDocument();
  });

  it('should suggest linking email when no mailbox is linked', async () => {
    mailboxes = [];
    renderPage();
    const section = await screen.findByRole('region', { name: 'Bank accounts' });
    expect(await within(section).findByText('No bank accounts yet.')).toBeInTheDocument();
    expect(
      within(section).getByText(/Link your email and we'll find your bank accounts/),
    ).toBeInTheDocument();
    expect(accountRequests).toBe(0);
  });

  it('should show an error when the accounts fail to load', async () => {
    server.use(
      http.get('/api/v1/mailboxes/accounts', () => new HttpResponse(null, { status: 500 })),
    );
    renderPage();
    expect(
      await screen.findByText('Failed to load bank accounts. Please try again.'),
    ).toBeInTheDocument();
  });

  it('should hide the section when mailbox features are off', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 404 })));
    renderPage();
    expect(await screen.findByText('HDFC Bank')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bank accounts' })).not.toBeInTheDocument();
    expect(accountRequests).toBe(0);
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

  it('should unlink after confirmation and refresh the cards and accounts', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Unlink us****@gmail.com?')).toBeInTheDocument();
    await waitFor(() => expect(accountRequests).toBeGreaterThan(0));
    const requestsBefore = cardRequests;
    const accountRequestsBefore = accountRequests;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByText(NO_MAILBOX)).toBeInTheDocument();
    await waitFor(() => expect(cardRequests).toBeGreaterThan(requestsBefore));
    await waitFor(() => expect(accountRequests).toBeGreaterThan(accountRequestsBefore));
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

  it('should reload the cards and accounts when a sync fails after saving some of them', async () => {
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
      accounts = [emailAccount];
      mailboxes = [mailbox({ lastSyncStatus: 'FAILED', lastSyncedAt: null })];
      await vi.advanceTimersByTimeAsync(SYNC_POLL_INTERVAL_MS);
      expect(await screen.findByText('ICICI Bank')).toBeInTheDocument();
      expect(await screen.findByText('KOTAK')).toBeInTheDocument();
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

describe('CreditCardsPage — statements', () => {
  const DOWNLOAD_URL = '/api/v1/mailboxes/statements/:id/download';

  beforeEach(() => {
    cards = [statementCard];
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:1'), revokeObjectURL: vi.fn() });
  });

  it('should show the latest statement with the amount masked', async () => {
    renderPage();
    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    expect(screen.getByText('₹ ••••••')).toBeInTheDocument();
    expect(screen.queryByText(/12,345/)).not.toBeInTheDocument();
  });

  it('should download the statement under its own name', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    server.use(
      http.get(
        DOWNLOAD_URL,
        () =>
          new HttpResponse('%PDF-1.7', {
            headers: { 'Content-Disposition': 'attachment; filename="HDFC.pdf"' },
          }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Download statement' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('HDFC.pdf');
    click.mockRestore();
  });

  it('should explain when the statement is no longer in the mailbox', async () => {
    server.use(
      http.get(DOWNLOAD_URL, () =>
        HttpResponse.json(
          { error: { code: 'STATEMENT_UNAVAILABLE', message: 'x' } },
          { status: 404 },
        ),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Download statement' }));
    expect(
      await screen.findByText('This statement is no longer available in your mailbox'),
    ).toBeInTheDocument();
  });

  it('should fall back to a generic message for an unexpected download failure', async () => {
    server.use(http.get(DOWNLOAD_URL, () => new HttpResponse('oops', { status: 502 })));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Download statement' }));
    expect(
      await screen.findByText("Couldn't download the statement. Please try again."),
    ).toBeInTheDocument();
  });

  it('should show Reconnect when a download finds the mailbox access expired', async () => {
    server.use(
      http.get(DOWNLOAD_URL, () => {
        mailboxes = [mailbox({ status: 'REAUTH_REQUIRED', lastSyncStatus: 'FAILED' })];
        return HttpResponse.json(
          { error: { code: 'MAILBOX_REAUTH_REQUIRED', message: 'x' } },
          { status: 409 },
        );
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Download statement' }));
    expect(
      await screen.findByText('Access to this mailbox has expired. Reconnect it first.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('should not offer downloads when mailbox features are off', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 404 })));
    renderPage();
    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download statement' })).not.toBeInTheDocument();
  });
});
