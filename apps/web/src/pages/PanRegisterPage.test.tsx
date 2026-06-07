import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { PanRegisterPage } from './PanRegisterPage';
import { AuthProvider } from '../context/AuthContext';

const server = setupServer(
  http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
  http.post('/api/v1/pan/register', () =>
    HttpResponse.json({ id: 'pan-1', panMasked: 'ABCDE####F', verifiedAt: null }, { status: 201 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderPage = (): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <PanRegisterPage />
    </AuthProvider>,
  );

describe('PanRegisterPage', () => {
  it('should render the registration title', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Link Your PAN')).toBeInTheDocument());
  });

  it('should show validation error when PAN is empty', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /link pan/i }));
    await userEvent.click(screen.getByRole('button', { name: /link pan/i }));
    await waitFor(() => expect(screen.getByText('PAN is required')).toBeInTheDocument());
  });

  it('should show format validation error for invalid PAN', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /link pan/i }));
    await userEvent.type(screen.getByLabelText(/pan/i), 'INVALID');
    await userEvent.click(screen.getByRole('button', { name: /link pan/i }));
    await waitFor(() =>
      expect(screen.getByText(/5 letters, 4 digits, 1 letter/i)).toBeInTheDocument(),
    );
  });

  it('should show API error on registration failure', async () => {
    server.use(http.post('/api/v1/pan/register', () => new HttpResponse(null, { status: 400 })));
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /link pan/i }));
    await userEvent.type(screen.getByLabelText(/pan/i), 'ABCDE1234F');
    await userEvent.click(screen.getByRole('button', { name: /link pan/i }));
    await waitFor(() =>
      expect(screen.getByText('Failed to link PAN. Please try again.')).toBeInTheDocument(),
    );
  });

  it('should uppercase the PAN input automatically', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/pan/i));
    const input = screen.getByLabelText(/pan/i) as HTMLInputElement;
    await userEvent.type(input, 'abcde1234f');
    expect(input.value).toBe('ABCDE1234F');
  });
});
