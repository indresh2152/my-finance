import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { settle } from '../test/deferred';
import { mailbox } from '../test/fixtures';
import { ProfilePage } from './ProfilePage';
import { AuthProvider } from '../context/AuthContext';
import { SYNC_POLL_INTERVAL_MS, type Mailbox } from '../services/mailbox.api';

const GATHERING = 'Gathering your card and account details…';
const NO_MAILBOX = 'No mailbox linked yet.';

vi.mock('../services/navigation', () => ({ redirectTo: vi.fn() }));

let mailboxes: Mailbox[] = [];
let mailboxRequests = 0;
let hasPan = true;
const server = setupServer(
  http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({
      id: '1',
      username: 'johndoe',
      email: 'john@example.com',
      hasPan,
      panMasked: hasPan ? 'ABCDE####F' : null,
    }),
  ),
  http.get('/api/v1/mailboxes', () => {
    mailboxRequests += 1;
    return HttpResponse.json({ mailboxes });
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
  mailboxes = [mailbox()];
  mailboxRequests = 0;
  hasPan = true;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const LocationProbe = (): ReactElement => <div data-testid="search">{useLocation().search}</div>;

const renderPage = (path = '/profile'): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <ProfilePage />
      <LocationProbe />
    </AuthProvider>,
    { initialEntries: [path] },
  );

describe('ProfilePage — account', () => {
  it('should show the username and email, but not the PAN', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(await screen.findByText('johndoe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/ABCDE/)).not.toBeInTheDocument();
  });

  it('should ask a user without a PAN to link one before linking email', async () => {
    hasPan = false;
    renderPage();
    expect(await screen.findByText(/Link your PAN before linking an email/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link PAN' })).toHaveAttribute('href', '/pan-register');
    expect(screen.queryByRole('button', { name: 'Link email' })).not.toBeInTheDocument();
    await settle();
    expect(mailboxRequests).toBe(0);
  });
});

describe('ProfilePage — link email', () => {
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
    renderPage('/profile?linked=1');
    expect(await screen.findByText('Mailbox linked.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''));
  });

  it('should show the translated error after a failed link', async () => {
    renderPage('/profile?error=MAILBOX_EMAIL_MISMATCH');
    expect(await screen.findByText(/signed in with a different account/)).toBeInTheDocument();
  });

  it('should fall back to a generic message for an unknown error code', async () => {
    renderPage('/profile?error=SOMETHING_ELSE');
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });
});

describe('ProfilePage — linked mailboxes', () => {
  it('should hide mailbox linking when the server has it turned off', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 404 })));
    renderPage();
    expect(await screen.findByText('johndoe')).toBeInTheDocument();
    await settle();
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

  it('should unlink after confirmation', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Unlink us****@gmail.com?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByText(NO_MAILBOX)).toBeInTheDocument();
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

describe('ProfilePage — gathering progress', () => {
  it('should show the progress banner while a mailbox has not finished its first sync', async () => {
    mailboxes = [
      mailbox({ lastSyncStatus: 'NEVER', lastSyncedAt: null, createdAt: new Date().toISOString() }),
    ];
    renderPage();
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it("should disable a mailbox's Refresh during the server's sync cooldown", async () => {
    mailboxes = [mailbox({ syncAvailableAt: new Date(Date.now() + 60_000).toISOString() })];
    renderPage();
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeDisabled();
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

  it('should show the banner after Refresh until the sync has run', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mailboxes = [mailbox({ lastSyncedAt: '2020-01-01T00:00:00Z' })];
      renderPage();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(await screen.findByRole('button', { name: 'Refresh' }));
      expect(await screen.findByText(GATHERING)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

      mailboxes = [mailbox({ lastSyncedAt: new Date(Date.now() + 60_000).toISOString() })];
      await vi.advanceTimersByTimeAsync(SYNC_POLL_INTERVAL_MS);
      await waitFor(() => expect(screen.queryByText(GATHERING)).not.toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});
