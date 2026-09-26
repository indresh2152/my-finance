import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { PanRegisterPage } from './PanRegisterPage';
import { AuthProvider } from '../context/AuthContext';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

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

  it('should show verified badge when verifiedAt is non-null', async () => {
    server.use(
      http.post('/api/v1/pan/register', () =>
        HttpResponse.json(
          { id: 'pan-1', panMasked: 'ABCDE####F', verifiedAt: '2026-06-07T00:00:00Z' },
          { status: 201 },
        ),
      ),
    );
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /link pan/i }));
    await userEvent.type(screen.getByLabelText(/pan/i), 'ABCDE1234F');
    await userEvent.click(screen.getByRole('button', { name: /link pan/i }));
    await waitFor(() =>
      expect(screen.getByText('PAN verified successfully')).toBeInTheDocument(),
    );
  });

  it('should show verificationFailed error when API returns PAN_VERIFICATION_FAILED', async () => {
    server.use(
      http.post('/api/v1/pan/register', () =>
        HttpResponse.json(
          { error: { code: 'PAN_VERIFICATION_FAILED', message: 'invalid' } },
          { status: 422 },
        ),
      ),
    );
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /link pan/i }));
    await userEvent.type(screen.getByLabelText(/pan/i), 'ABCDE1234F');
    await userEvent.click(screen.getByRole('button', { name: /link pan/i }));
    await waitFor(() =>
      expect(
        screen.getByText('PAN could not be verified. Please check your PAN and try again.'),
      ).toBeInTheDocument(),
    );
  });

  it('should show kycUnavailable error when API returns PAN_KYC_UNAVAILABLE', async () => {
    server.use(
      http.post('/api/v1/pan/register', () =>
        HttpResponse.json(
          { error: { code: 'PAN_KYC_UNAVAILABLE', message: 'unavailable' } },
          { status: 502 },
        ),
      ),
    );
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /link pan/i }));
    await userEvent.type(screen.getByLabelText(/pan/i), 'ABCDE1234F');
    await userEvent.click(screen.getByRole('button', { name: /link pan/i }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'PAN verification service is currently unavailable. Please try again later.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('should navigate to home when Skip for now is clicked', async () => {
    const HomeStub: React.FC = () => <div>Home Page</div>;
    renderWithProviders(
      <AuthProvider>
        <Routes>
          <Route path="/pan-register" element={<PanRegisterPage />} />
          <Route path="/" element={<HomeStub />} />
        </Routes>
      </AuthProvider>,
      { initialEntries: ['/pan-register'] },
    );
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => expect(screen.getByText('Home Page')).toBeInTheDocument());
  });
});
