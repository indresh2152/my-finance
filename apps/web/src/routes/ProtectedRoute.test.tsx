import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthProvider, useAuth } from '../context/AuthContext';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';

const server = setupServer(
  http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ChildPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div>
      Protected Content
      <button onClick={() => navigate('/loans')}>Go to accounts</button>
    </div>
  );
};
const LoginPage: React.FC = () => (
  <>
    <div>Login Page</div>
    <div data-testid="login-search">{useLocation().search}</div>
  </>
);
const PanRegisterPage: React.FC = () => {
  const { skipPan } = useAuth();
  const navigate = useNavigate();
  return (
    <div>
      PAN Register Page
      <button
        onClick={() => {
          skipPan();
          navigate('/');
        }}
      >
        Skip
      </button>
    </div>
  );
};

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
          path="/loans"
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
  it('should keep the query string in the login redirect', async () => {
    renderRoute('/loans?linked=1');
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
    expect(screen.getByTestId('login-search')).toHaveTextContent(
      `?redirect=${encodeURIComponent('/loans?linked=1')}`,
    );
  });

  it('should redirect to /login when user is not authenticated', async () => {
    renderRoute('/');
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });

  it('should redirect to /pan-register when user has no PAN on a financial route', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
      http.get('/api/v1/users/me', () =>
        HttpResponse.json({
          id: '1',
          username: 'u',
          email: 'e@e.com',
          hasPan: false,
          panMasked: null,
        }),
      ),
    );
    renderRoute('/');
    await waitFor(() => expect(screen.getByText('PAN Register Page')).toBeInTheDocument());
  });

  it('should render children when user is authenticated with a PAN', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
      http.get('/api/v1/users/me', () =>
        HttpResponse.json({
          id: '1',
          username: 'u',
          email: 'e@e.com',
          hasPan: true,
          panMasked: 'ABCDE####F',
        }),
      ),
    );
    renderRoute('/loans');
    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });

  it('should allow the home route but still gate financial routes after the user skips PAN', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
      http.get('/api/v1/users/me', () =>
        HttpResponse.json({
          id: '1',
          username: 'u',
          email: 'e@e.com',
          hasPan: false,
          panMasked: null,
        }),
      ),
    );
    renderRoute('/pan-register');
    await waitFor(() => screen.getByRole('button', { name: 'Skip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });

  it('should still redirect loans to /pan-register after the user skips PAN', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
      http.get('/api/v1/users/me', () =>
        HttpResponse.json({
          id: '1',
          username: 'u',
          email: 'e@e.com',
          hasPan: false,
          panMasked: null,
        }),
      ),
    );
    renderRoute('/pan-register');
    await waitFor(() => screen.getByRole('button', { name: 'Skip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => screen.getByRole('button', { name: 'Go to accounts' }));
    await userEvent.click(screen.getByRole('button', { name: 'Go to accounts' }));
    await waitFor(() => expect(screen.getByText(/PAN Register Page/)).toBeInTheDocument());
  });
});
