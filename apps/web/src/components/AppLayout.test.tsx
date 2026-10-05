import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { settle } from '../test/deferred';
import { AppLayout } from './AppLayout';
import { AuthProvider } from '../context/AuthContext';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

const LoginPage: React.FC = () => <div>Login Page</div>;

const server = setupServer(
  http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({
      id: '1',
      username: 'johndoe',
      email: 'j@j.com',
      hasPan: true,
      panMasked: 'ABCDE####F',
    }),
  ),
  http.delete('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderLayout = (): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>Home Content</div>} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </AuthProvider>,
  );

describe('AppLayout', () => {
  it('should render the app name', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText('MyFinance')).toBeInTheDocument());
  });

  it('should not show the PAN, even masked, once the user has loaded', async () => {
    let profileLoaded = false;
    server.use(
      http.get('/api/v1/users/me', () => {
        profileLoaded = true;
        return HttpResponse.json({
          id: '1',
          username: 'johndoe',
          email: 'j@j.com',
          hasPan: true,
          panMasked: 'ABCDE####F',
        });
      }),
    );
    renderLayout();
    await waitFor(() => expect(profileLoaded).toBe(true));
    await settle();
    expect(screen.queryByText(/ABCDE/)).not.toBeInTheDocument();
  });

  it('should render the API Docs nav link pointing to the in-app docs page', async () => {
    renderLayout();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'API Docs' })).toHaveAttribute('href', '/api-docs'),
    );
  });

  it('should not link to separate Credit Cards or From Email pages', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByRole('link', { name: 'API Docs' })).toBeVisible());
    expect(screen.queryByRole('link', { name: /credit cards/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'From Email' })).not.toBeInTheDocument();
  });

  it("should show the user's initial in place of a sign-out button", async () => {
    renderLayout();
    const accountButton = await screen.findByRole('button', { name: 'Open account menu' });
    expect(accountButton).toHaveTextContent('J');
    expect(screen.queryByRole('button', { name: /logout|sign out/i })).not.toBeInTheDocument();
  });

  it('should navigate to login after signing out from the account menu', async () => {
    renderLayout();
    await userEvent.click(await screen.findByRole('button', { name: 'Open account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });
});
