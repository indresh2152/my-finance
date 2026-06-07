import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullPageSpinner } from '../components/FullPageSpinner';

const FINANCIAL_ROUTES = new Set(['/', '/credit-cards', '/bank-accounts', '/loans', '/investments', '/insurance']);

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!user.hasPan && FINANCIAL_ROUTES.has(location.pathname)) {
    return <Navigate to="/pan-register" replace />;
  }

  return <>{children}</>;
};
