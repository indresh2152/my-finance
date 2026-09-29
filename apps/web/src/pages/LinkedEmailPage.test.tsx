import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { LinkedEmailPage } from './LinkedEmailPage';
import type { Mailbox } from '../services/mailbox.api';

const GATHERING = 'Gathering your card and account details…';

vi.mock('../services/navigation', () => ({ redirectTo: vi.fn() }));

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

let mailboxes: Mailbox[] = [];
const server = setupServer(
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
  mailboxes = [mailbox()];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const LocationProbe = (): ReactElement => <div data-testid="search">{useLocation().search}</div>;

const renderPage = (path = '/linked-email'): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(<LinkedEmailPage />, { initialEntries: [path] });

describe('LinkedEmailPage', () => {
  it('should show the empty state and the link form when no mailbox is linked', async () => {
    mailboxes = [];
    renderPage();
    expect(
      await screen.findByText('No mailbox linked yet. Link one below to get started.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('should list linked mailboxes with provider and last sync time', async () => {
    renderPage();
    expect(await screen.findByText('us****@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    expect(screen.queryByText(GATHERING)).not.toBeInTheDocument();
  });

  it('should show the progress banner while a mailbox has not finished its first sync', async () => {
    mailboxes = [mailbox({ lastSyncStatus: 'NEVER', lastSyncedAt: null })];
    renderPage();
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('should not show the progress banner for a mailbox whose access expired', async () => {
    mailboxes = [mailbox({ status: 'REAUTH_REQUIRED', lastSyncStatus: 'NEVER' })];
    renderPage();
    expect(await screen.findByText('us****@gmail.com')).toBeInTheDocument();
    expect(screen.queryByText(GATHERING)).not.toBeInTheDocument();
  });

  it('should show the progress banner after Refresh until the requested sync has run', async () => {
    mailboxes = [mailbox({ lastSyncedAt: '2020-01-01T00:00:00Z' })];
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(GATHERING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

    mailboxes = [mailbox({ lastSyncedAt: new Date(Date.now() + 60_000).toISOString() })];
    await waitFor(() => expect(screen.queryByText(GATHERING)).not.toBeInTheDocument(), {
      timeout: 5000,
    });
  }, 10_000);

  it('should not show the progress banner when the refresh request is rejected', async () => {
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', () =>
        HttpResponse.json({ error: { code: 'SYNC_TOO_FREQUENT', message: 'x' } }, { status: 429 }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/synced recently/)).toBeInTheDocument();
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

  it('should ask to reconnect a mailbox whose access expired and focus the email field', async () => {
    mailboxes = [mailbox({ status: 'REAUTH_REQUIRED' })];
    renderPage();
    expect(
      await screen.findByText('Access expired. Reconnect to keep syncing.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(screen.getByLabelText('Email address')).toHaveFocus();
  });

  it('should show a success notice after linking', async () => {
    renderPage('/linked-email?linked=1');
    expect(await screen.findByText('Mailbox linked.')).toBeInTheDocument();
  });

  it('should remove the linked flag from the URL after showing the notice', async () => {
    renderWithProviders(
      <>
        <LinkedEmailPage />
        <LocationProbe />
      </>,
      { initialEntries: ['/linked-email?linked=1'] },
    );
    expect(await screen.findByText('Mailbox linked.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(''));
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('should show the translated error after a failed link', async () => {
    renderPage('/linked-email?error=MAILBOX_EMAIL_MISMATCH');
    expect(await screen.findByText(/signed in with a different account/)).toBeInTheDocument();
  });

  it('should fall back to a generic message for an unknown error code', async () => {
    renderPage('/linked-email?error=SOMETHING_ELSE');
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('should request a sync when Refresh is clicked', async () => {
    let syncRequested = false;
    server.use(
      http.post('/api/v1/mailboxes/:id/sync', () => {
        syncRequested = true;
        return HttpResponse.json({ queued: true }, { status: 202 });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(syncRequested).toBe(true));
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
    expect(
      await screen.findByText('No mailbox linked yet. Link one below to get started.'),
    ).toBeInTheDocument();
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

  it('should show an error when mailboxes fail to load', async () => {
    server.use(http.get('/api/v1/mailboxes', () => new HttpResponse(null, { status: 500 })));
    renderPage();
    expect(
      await screen.findByText('Failed to load your linked mailboxes. Please try again.'),
    ).toBeInTheDocument();
  });
});
