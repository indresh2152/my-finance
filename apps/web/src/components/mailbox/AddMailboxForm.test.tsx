import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AddMailboxForm } from './AddMailboxForm';
import { redirectTo } from '../../services/navigation';

vi.mock('../../services/navigation', () => ({ redirectTo: vi.fn() }));

const server = setupServer(
  http.post('/api/v1/mailboxes/resolve', () =>
    HttpResponse.json({ supported: true, provider: 'GOOGLE', authType: 'OAUTH' }),
  ),
  http.post('/api/v1/mailboxes/connect', () =>
    HttpResponse.json({ authUrl: 'https://accounts.example/auth' }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const typeEmail = async (value: string): Promise<void> => {
  await userEvent.type(screen.getByLabelText('Email address'), value);
};

describe('AddMailboxForm', () => {
  it('should keep Continue disabled and show a hint for an invalid email', async () => {
    renderWithProviders(<AddMailboxForm />);
    await typeEmail('not-an-email');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('should offer the resolved provider and redirect to its sign-in page', async () => {
    renderWithProviders(<AddMailboxForm />);
    await typeEmail('user@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const continueWith = await screen.findByRole('button', { name: 'Continue with Google' });
    await userEvent.click(continueWith);
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://accounts.example/auth'));
  });

  it('should explain when the provider is not supported', async () => {
    server.use(
      http.post('/api/v1/mailboxes/resolve', () =>
        HttpResponse.json({ supported: false, reason: 'PROVIDER_NOT_SUPPORTED' }),
      ),
    );
    renderWithProviders(<AddMailboxForm />);
    await typeEmail('me@yahoo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/isn't supported yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue with/ })).not.toBeInTheDocument();
  });

  it('should show the API error message when the mailbox is already linked', async () => {
    server.use(
      http.post('/api/v1/mailboxes/resolve', () =>
        HttpResponse.json(
          { error: { code: 'MAILBOX_ALREADY_LINKED', message: 'x' } },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<AddMailboxForm />);
    await typeEmail('user@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('This mailbox is already linked.')).toBeInTheDocument();
  });

  it('should show a generic error when connect fails without a code', async () => {
    server.use(
      http.post('/api/v1/mailboxes/connect', () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<AddMailboxForm />);
    await typeEmail('user@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('should clear the provider choice when the email changes', async () => {
    renderWithProviders(<AddMailboxForm />);
    await typeEmail('user@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Continue with Google' });
    await typeEmail('x');
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('should re-enable the buttons when the page is restored from the back-forward cache', async () => {
    renderWithProviders(<AddMailboxForm />);
    await typeEmail('user@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(redirectTo).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();

    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(pageShow);
    });

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});
