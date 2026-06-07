import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../context/AuthContext';
import React from 'react';

const HomeStub: React.FC = () => <div>Home</div>;

const server = setupServer(
  http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
  http.post('/api/v1/auth/login', () =>
    HttpResponse.json({
      accessToken: 'mock-token',
      user: { id: '1', username: 'testuser', email: 't@t.com', hasPan: true },
    }),
  ),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({ id: '1', username: 'testuser', email: 't@t.com', hasPan: true, panMasked: 'ABCDE####F' }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderLogin = (): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomeStub />} />
      </Routes>
    </AuthProvider>,
    { initialEntries: ['/login'] },
  );

describe('LoginPage', () => {
  it('should render the login title', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByText('Sign in to MyFinance')).toBeInTheDocument());
  });

  it('should show validation errors when form is submitted empty', async () => {
    renderLogin();
    await waitFor(() => screen.getByRole('button', { name: /sign in/i }));
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Username is required')).toBeInTheDocument());
  });

  it('should show API error when login fails', async () => {
    server.use(http.post('/api/v1/auth/login', () => new HttpResponse(null, { status: 401 })));
    renderLogin();
    await waitFor(() => screen.getByRole('button', { name: /sign in/i }));
    await userEvent.type(screen.getByLabelText(/username/i), 'baduser');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByText('Username or password is incorrect')).toBeInTheDocument(),
    );
  });

  it('should navigate after successful login', async () => {
    renderLogin();
    await waitFor(() => screen.getByRole('button', { name: /sign in/i }));
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
  });
});
