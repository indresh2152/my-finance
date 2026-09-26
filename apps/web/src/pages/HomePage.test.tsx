import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { HomePage } from './HomePage';
import { AuthProvider } from '../context/AuthContext';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

const CreditCardsStub: React.FC = () => <div>Credit Cards Page</div>;
const PanRegisterStub: React.FC = () => <div>PAN Register Page</div>;

const server = setupServer(
  http.post('/api/v1/auth/refresh', () =>
    HttpResponse.json({ accessToken: 'token' }),
  ),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({ id: '1', username: 'johndoe', email: 'j@j.com', hasPan: true, panMasked: 'ABCDE####F' }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderPage = (): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/credit-cards" element={<CreditCardsStub />} />
        <Route path="/pan-register" element={<PanRegisterStub />} />
      </Routes>
    </AuthProvider>,
  );

describe('HomePage', () => {
  it('should render the home heading', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
  });

  it('should display the username after session restore', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/johndoe/)).toBeInTheDocument());
  });

  it('should show the masked PAN', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/ABCDE####F/)).toBeInTheDocument());
  });

  it('should navigate to credit cards when clicking the card', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /credit cards/i }));
    await userEvent.click(screen.getByRole('button', { name: /credit cards/i }));
    await waitFor(() => expect(screen.getByText('Credit Cards Page')).toBeInTheDocument());
  });

  it('should not show the link-PAN prompt when a PAN is linked', async () => {
    renderPage();
    await waitFor(() => screen.getByText(/johndoe/));
    expect(screen.queryByText(/link your pan/i)).not.toBeInTheDocument();
  });

  it('should show a link-PAN prompt that navigates to PAN registration when no PAN is linked', async () => {
    server.use(
      http.get('/api/v1/users/me', () =>
        HttpResponse.json({ id: '1', username: 'johndoe', email: 'j@j.com', hasPan: false, panMasked: null }),
      ),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/link your pan/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Link PAN' }));
    await waitFor(() => expect(screen.getByText('PAN Register Page')).toBeInTheDocument());
  });
});
