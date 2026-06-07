import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthProvider } from '../context/AuthContext';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

const server = setupServer(
  http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ChildPage: React.FC = () => <div>Protected Content</div>;
const LoginPage: React.FC = () => <div>Login Page</div>;
const PanRegisterPage: React.FC = () => <div>PAN Register Page</div>;

const renderRoute = (initialPath: string): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pan-register" element={<PanRegisterPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ChildPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/credit-cards"
          element={
            <ProtectedRoute>
              <ChildPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>,
    { initialEntries: [initialPath] },
  );

describe('ProtectedRoute', () => {
  it('should redirect to /login when user is not authenticated', async () => {
    renderRoute('/');
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });

  it('should redirect to /pan-register when user has no PAN on a financial route', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
      http.get('/api/v1/users/me', () =>
        HttpResponse.json({ id: '1', username: 'u', email: 'e@e.com', hasPan: false, panMasked: null }),
      ),
    );
    renderRoute('/');
    await waitFor(() => expect(screen.getByText('PAN Register Page')).toBeInTheDocument());
  });

  it('should render children when user is authenticated with a PAN', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
      http.get('/api/v1/users/me', () =>
        HttpResponse.json({ id: '1', username: 'u', email: 'e@e.com', hasPan: true, panMasked: 'ABCDE####F' }),
      ),
    );
    renderRoute('/credit-cards');
    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });
});
