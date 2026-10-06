import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { theme } from './theme';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { FullPageSpinner } from './components/FullPageSpinner';
import { LegacyPageRedirect } from './routes/LegacyPageRedirect';

const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const CardStatementsPage = lazy(() =>
  import('./pages/CardStatementsPage').then((m) => ({ default: m.CardStatementsPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const PanRegisterPage = lazy(() =>
  import('./pages/PanRegisterPage').then((m) => ({ default: m.PanRegisterPage })),
);
const ApiDocsPage = lazy(() =>
  import('./pages/ApiDocsPage').then((m) => ({ default: m.ApiDocsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  // Old page URLs only redirect; the target page applies the auth and PAN guard.
  { path: '/credit-cards', element: <LegacyPageRedirect /> },
  { path: '/linked-email', element: <LegacyPageRedirect /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'cards/:cardId', element: <CardStatementsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'pan-register', element: <PanRegisterPage /> },
      { path: 'api-docs', element: <ApiDocsPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Suspense fallback={<FullPageSpinner />}>
          <RouterProvider router={router} />
        </Suspense>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
