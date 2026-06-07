import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppLayout } from './AppLayout';
import { AuthProvider } from '../context/AuthContext';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

const LoginPage: React.FC = () => <div>Login Page</div>;

const server = setupServer(
  http.post('/api/v1/auth/refresh', () =>
    HttpResponse.json({ accessToken: 'token' }),
  ),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({ id: '1', username: 'johndoe', email: 'j@j.com', hasPan: true, panMasked: 'ABCDE####F' }),
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

  it('should display the masked PAN chip when user has PAN', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText('ABCDE####F')).toBeInTheDocument());
  });

  it('should render the Credit Cards nav link', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText('Credit Cards')).toBeInTheDocument());
  });

  it('should navigate to login after logout', async () => {
    renderLayout();
    await waitFor(() => screen.getByLabelText('Logout'));
    await userEvent.click(screen.getByLabelText('Logout'));
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });
});
