import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullPageSpinner } from '../components/FullPageSpinner';

const HOME_ROUTE = '/';
const FINANCIAL_ROUTES = new Set([
  '/',
  '/credit-cards',
  '/bank-accounts',
  '/loans',
  '/investments',
  '/insurance',
]);

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, panSkipped } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const isSkippableRoute = panSkipped && location.pathname === HOME_ROUTE;
  if (!user.hasPan && FINANCIAL_ROUTES.has(location.pathname) && !isSkippableRoute) {
    return <Navigate to="/pan-register" replace />;
  }

  return <>{children}</>;
};
