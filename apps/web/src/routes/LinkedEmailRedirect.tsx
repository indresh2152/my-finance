import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * The old "From Email" page now lives on Credit Cards. Keeps the query string so an OAuth callback
 * that was already in flight (?linked=1 or ?error=...) still shows its notice.
 * Safe to delete once old bookmarks and in-flight callbacks have aged out.
 */
export const LinkedEmailRedirect: React.FC = () => {
  const { search } = useLocation();
  return <Navigate to={`/credit-cards${search}`} replace />;
};
