import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { deferred, settle } from '../test/deferred';
import { DashboardPage } from './DashboardPage';
import { AuthProvider } from '../context/AuthContext';
import { SYNC_POLL_INTERVAL_MS, type Mailbox } from '../services/mailbox.api';
import { mailbox } from '../test/fixtures';
import type { CreditCard } from '../services/credit-cards.api';
import type { EmailAccount } from '../services/accounts.api';

const GATHERING = 'Gathering your card and account details…';

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
let mailboxRequests = 0;
let syncedIds: string[] = [];
let hasPan = true;
const server = setupServer(
  http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({
      id: '1',
      username: 'u',
      email: 'e@e.com',
      hasPan,
      panMasked: hasPan ? 'ABCDE####F' : null,
    }),
  ),
  http.get('/api/v1/credit-cards', () => {
    cardRequests += 1;
    return HttpResponse.json({ cards });
  }),
  http.get('/api/v1/mailboxes', () => {
    mailboxRequests += 1;
    return HttpResponse.json({ mailboxes });
  }),
  http.get('/api/v1/mailboxes/accounts', () => {
    accountRequests += 1;
    return HttpResponse.json({ data: accounts });
  }),
  http.post('/api/v1/mailboxes/:id/sync', ({ params }) => {
    syncedIds.push(String(params['id']));
    return HttpResponse.json({ queued: true }, { status: 202 });
  }),
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
  mailboxRequests = 0;
  syncedIds = [];
  hasPan = true;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderPage = (path = '/'): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <DashboardPage />
    </AuthProvider>,
    { initialEntries: [path] },
  );

/** Switches to the Accounts tab and returns its panel. */
const openAccountsTab = async (): Promise<HTMLElement> => {
  await userEvent.click(await screen.findByRole('tab', { name: 'Accounts' }));
  return screen.getByRole('tabpanel', { name: 'Accounts' });
};

describe('DashboardPage — layout', () => {
  it('should render the page title', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('should open on the Credit cards tab and switch to Accounts', async () => {
    accounts = [emailAccount];
    renderPage();
    const cardsTab = await screen.findByRole('tab', { name: 'Credit cards' });
    expect(cardsTab).toHaveAttribute('aria-selected', 'true');
    expect(
      await within(screen.getByRole('tabpanel', { name: 'Credit cards' })).findByText('HDFC Bank'),
    ).toBeInTheDocument();

    const panel = await openAccountsTab();
    expect(await within(panel).findByText('KOTAK')).toBeInTheDocument();
    expect(screen.queryByText('HDFC Bank')).not.toBeInTheDocument();

    await userEvent.click(cardsTab);
    expect(await screen.findByText('HDFC Bank')).toBeInTheDocument();
  });

  it('should not manage mailboxes here: no Link email, list or Unlink', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Link email' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link email' })).not.toBeInTheDocument();
    expect(screen.queryByText('Linked mailboxes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument();
  });

  it('should only ask a user without a PAN to link one, loading nothing else', async () => {
    hasPan = false;
    renderPage();
    expect(await screen.findByText(/link your pan/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link PAN' })).toHaveAttribute('href', '/pan-register');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(cardRequests).toBe(0);
    expect(mailboxRequests).toBe(0);
  });
});

describe('DashboardPage — refresh', () => {
  it('should sync every linked mailbox and show the progress banner', async () => {
    mailboxes = [mailbox({ id: 'a' }), mailbox({ id: 'b', emailMasked: 'b****@outlook.com' })];
    renderPage();
    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    await userEvent.click(refresh);
    await waitFor(() => expect(syncedIds.sort()).toEqual(['a', 'b']));
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('should skip a mailbox whose access expired', async () => {
    mailboxes = [mailbox({ id: 'a' }), mailbox({ id: 'b', status: 'REAUTH_REQUIRED' })];
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(syncedIds).toEqual(['a']));
  });

  it('should skip a mailbox still in the sync cooldown', async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    mailboxes = [mailbox({ id: 'a' }), mailbox({ id: 'b', syncAvailableAt: later })];
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(syncedIds).toEqual(['a']));
  });

  it('should re-enable Refresh when the sync cooldown ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mailboxes = [mailbox({ syncAvailableAt: new Date(Date.now() + 60_000).toISOString() })];
      renderPage();
      expect(await screen.findByRole('button', { name: 'Refresh' })).toBeDisabled();
      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    } finally {
      vi.useRealTimers();
    }
  });

  it('should be disabled when no mailbox can sync now', async () => {
    mailboxes = [mailbox({ status: 'REAUTH_REQUIRED' })];
    renderPage();
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('should not be offered before any mailbox is linked', async () => {
    mailboxes = [];
    renderPage();
    expect(await screen.findByText('HDFC Bank')).toBeInTheDocument();
    await waitFor(() => expect(mailboxRequests).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('should not report a mailbox that synced recently when another started syncing', async () => {
    mailboxes = [mailbox({ id: 'a' }), mailbox({ id: 'b', emailMasked: 'b****@outlook.com' })];
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', ({ params }) =>
        params['id'] === 'a'
          ? HttpResponse.json(
              { error: { code: 'SYNC_TOO_FREQUENT', message: 'x' } },
              { status: 429 },
            )
          : HttpResponse.json({ queued: true }, { status: 202 }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
    expect(screen.queryByText(/synced recently/)).not.toBeInTheDocument();
  });

  it('should still report other failures when another mailbox started syncing', async () => {
    mailboxes = [mailbox({ id: 'a' }), mailbox({ id: 'b', emailMasked: 'b****@outlook.com' })];
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', ({ params }) =>
        params['id'] === 'a'
          ? HttpResponse.json(
              { error: { code: 'MAILBOX_NOT_FOUND', message: 'x' } },
              { status: 404 },
            )
          : HttpResponse.json({ queued: true }, { status: 202 }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('This mailbox is no longer linked.')).toBeInTheDocument();
  });

  it('should stay disabled until every sync request has answered', async () => {
    mailboxes = [mailbox({ id: 'a' }), mailbox({ id: 'b', emailMasked: 'b****@outlook.com' })];
    const slow = deferred();
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', async ({ params }) => {
        if (params['id'] === 'a') await slow.promise;
        syncedIds.push(String(params['id']));
        return HttpResponse.json({ queued: true }, { status: 202 });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(syncedIds).toEqual(['b']));
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    slow.release();
    await waitFor(() => expect(syncedIds.sort()).toEqual(['a', 'b']));
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
  });

  it('should explain when a sync was requested too soon', async () => {
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', () =>
        HttpResponse.json({ error: { code: 'SYNC_TOO_FREQUENT', message: 'x' } }, { status: 429 }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    const tooSoon = 'This mailbox was synced recently. Try again in a few minutes.';
    expect(await screen.findByText(tooSoon)).toBeInTheDocument();
    expect(screen.queryByText(GATHERING)).not.toBeInTheDocument();
    await userEvent.click(within(alertWith(tooSoon)).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText(tooSoon)).not.toBeInTheDocument());
  });
});

describe('DashboardPage — cards', () => {
  it('should display a credit card with bank, network, last 4 digits and expiry', async () => {
    renderPage();
    expect(await screen.findByText('HDFC Bank')).toBeInTheDocument();
    expect(screen.getByText('VISA')).toBeInTheDocument();
    expect(screen.getByText('•••• 4242')).toBeInTheDocument();
    expect(screen.getByText(/12\/2027/)).toBeInTheDocument();
  });

  it('should mask the credit limit until revealed, then show it in INR', async () => {
    const { container } = renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Show Credit Limit' }));
    expect(screen.getByText('₹5,00,000.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide Credit Limit' }));
    expect(container.textContent).not.toMatch(/5,00,000/);
  });

  it('should keep card amounts hidden by default', async () => {
    const { container } = renderPage();
    expect(await screen.findByText('Credit Limit')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/5,00,000|3,50,000|1,50,000/);
  });

  it("should show a card's name before its digits", async () => {
    cards = [{ ...emailCard, cardName: 'Amazon Pay' }];
    renderPage();
    expect(await screen.findByText('Amazon Pay')).toBeInTheDocument();
    expect(screen.getByText('•••• 9876')).toBeInTheDocument();
  });

  it("should brand an email card with its bank's full name", async () => {
    cards = [{ ...emailCard, issuingBank: 'SBI_CARD', cardNetwork: 'MASTERCARD' }];
    renderPage();
    expect(await screen.findByRole('heading', { name: 'SBI Card' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeInTheDocument();
  });

  it('should name a card whose bank emails never show its digits', async () => {
    cards = [{ ...emailCard, issuingBank: 'HDFC', cardNumberLast4: null, cardName: 'Pixel Play' }];
    renderPage();
    expect(await screen.findByText('Pixel Play')).toBeInTheDocument();
    // No masked card number; the masked amounts (₹ ••••••) are a different thing.
    expect(screen.queryByText(/^•••• \d{4}$/)).not.toBeInTheDocument();
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

  it('should point to the profile to link an email when none is linked', async () => {
    cards = [];
    mailboxes = [];
    renderPage();
    expect(await screen.findByText('No credit cards yet.')).toBeInTheDocument();
    expect(
      within(alertWith('No credit cards yet.')).getByText(/Link your email from your profile/),
    ).toBeInTheDocument();
    expect(within(alertWith('No credit cards yet.')).queryByRole('button')).not.toBeInTheDocument();
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

describe('DashboardPage — bank accounts', () => {
  it('should show each account with its balance masked and the date it was reported', async () => {
    accounts = [emailAccount];
    const { container } = renderPage();
    const panel = await openAccountsTab();
    expect(await within(panel).findByText('KOTAK')).toBeInTheDocument();
    expect(within(panel).getByText('•••• 7890')).toBeInTheDocument();
    expect(within(panel).getByText('Savings')).toBeInTheDocument();
    expect(within(panel).getByText(/^as of 24 Sept? 2026$/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/2,34,567/);

    await userEvent.click(within(panel).getByRole('button', { name: 'Show Available balance' }));
    expect(within(panel).getByText('₹2,34,567.89')).toBeInTheDocument();
  });

  it('should leave out the type chip when the email did not say', async () => {
    accounts = [{ ...emailAccount, accountType: 'OTHER' }];
    renderPage();
    const panel = await openAccountsTab();
    expect(await within(panel).findByText('KOTAK')).toBeInTheDocument();
    expect(within(panel).queryByText('Savings')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/other/i)).not.toBeInTheDocument();
  });

  it('should report that none were found when a mailbox is linked', async () => {
    renderPage();
    const panel = await openAccountsTab();
    expect(
      await within(panel).findByText(/haven't found any bank accounts in your linked email yet/),
    ).toBeInTheDocument();
  });

  it('should suggest linking email when no mailbox is linked', async () => {
    mailboxes = [];
    renderPage();
    const panel = await openAccountsTab();
    expect(await within(panel).findByText('No bank accounts yet.')).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /Link your email from your profile and we'll find your bank accounts/,
      ),
    ).toBeInTheDocument();
    expect(accountRequests).toBe(0);
  });

  it('should show an error when the accounts fail to load', async () => {
    server.use(
      http.get('/api/v1/mailboxes/accounts', () => new HttpResponse(null, { status: 500 })),
    );
    renderPage();
    await openAccountsTab();
    expect(
      await screen.findByText('Failed to load bank accounts. Please try again.'),
    ).toBeInTheDocument();
  });

  it('should not suggest linking an email when mailbox features are off', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 404 })));
    cards = [];
    renderPage();
    expect(await screen.findByText('No credit cards yet.')).toBeInTheDocument();
    await settle();
    expect(screen.queryByText(/Link your email/)).not.toBeInTheDocument();
  });

  it('should hide the Accounts tab when mailbox features are off', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 404 })));
    renderPage();
    expect(await screen.findByText('HDFC Bank')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Credit cards' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Accounts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(accountRequests).toBe(0);
  });
});

describe('DashboardPage — gathering progress', () => {
  it.each([
    { tab: 'Credit cards', found: 'ICICI Bank' },
    { tab: 'Accounts', found: 'KOTAK' },
  ])(
    'should reload the $tab tab when a sync fails after saving some records',
    async ({ tab, found }) => {
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
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.click(await screen.findByRole('tab', { name: tab }));
        expect(await screen.findByText(GATHERING)).toBeInTheDocument();

        cards = [emailCard];
        accounts = [emailAccount];
        mailboxes = [mailbox({ lastSyncStatus: 'FAILED', lastSyncedAt: null })];
        await vi.advanceTimersByTimeAsync(SYNC_POLL_INTERVAL_MS);
        expect(await screen.findByText(found)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

describe('DashboardPage — show all amounts', () => {
  const SHOW_ALL = 'Show all amounts';

  beforeEach(() => {
    cards = [statementCard];
    accounts = [emailAccount];
  });

  it('should keep amounts hidden by default', async () => {
    const { container } = renderPage();
    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SHOW_ALL })).toHaveAttribute('aria-pressed', 'false');
    expect(container.textContent).not.toMatch(/12,345/);
  });

  it('should show every amount on both tabs, and hide them again', async () => {
    const { container } = renderPage();
    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: SHOW_ALL }));
    expect(screen.getByText('₹12,345.67')).toBeInTheDocument();

    const panel = await openAccountsTab();
    expect(await within(panel).findByText('₹2,34,567.89')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: SHOW_ALL });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(container.textContent).not.toMatch(/2,34,567/);
  });

  it('should still let one amount be hidden while the rest are shown', async () => {
    renderPage();
    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: SHOW_ALL }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide Amount due' }));
    expect(screen.queryByText('₹12,345.67')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: SHOW_ALL })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('DashboardPage — statements', () => {
  const DOWNLOAD_URL = '/api/v1/mailboxes/statements/:id/download';

  beforeEach(() => {
    cards = [statementCard];
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:1'), revokeObjectURL: vi.fn() });
  });

  it('should show the latest statement with the amount masked', async () => {
    renderPage();
    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Amount due' })).toBeInTheDocument();
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

  it('should explain when a download finds the mailbox access expired', async () => {
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
  });

  it('should not offer downloads when mailbox features are off', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 404 })));
    renderPage();
    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download statement' })).not.toBeInTheDocument();
  });
});
