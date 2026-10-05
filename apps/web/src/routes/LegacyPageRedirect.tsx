import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasLinkResult } from '../hooks/useMailboxes';

/**
 * The old Credit Cards and From Email pages. An OAuth result from a callback that was already in
 * flight (?linked=1 or ?error=...) goes to the profile page, where mailboxes are now linked, to
 * show its notice; anything else goes to the dashboard.
 * Safe to delete once old bookmarks and in-flight callbacks have aged out.
 */
export const LegacyPageRedirect: React.FC = () => {
  const { search } = useLocation();
  return (
    <Navigate to={hasLinkResult(new URLSearchParams(search)) ? `/profile${search}` : '/'} replace />
  );
};
