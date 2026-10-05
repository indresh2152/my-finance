import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { renderWithProviders } from '../test/renderWithProviders';
import { LegacyPageRedirect } from './LegacyPageRedirect';

const LocationProbe = (): ReactElement => {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
};

const renderAt = (path: string): void => {
  renderWithProviders(
    <Routes>
      <Route path="/credit-cards" element={<LegacyPageRedirect />} />
      <Route path="/linked-email" element={<LegacyPageRedirect />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [path] },
  );
};

describe('LegacyPageRedirect', () => {
  it.each(['/credit-cards', '/linked-email'])(
    'should send an OAuth result on %s to the profile page, keeping it',
    (oldPage) => {
      renderAt(`${oldPage}?error=MAILBOX_ACCESS_DENIED`);
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/profile?error=MAILBOX_ACCESS_DENIED',
      );
    },
  );

  it.each(['/credit-cards', '/linked-email'])(
    'should send a plain %s to the dashboard',
    (oldPage) => {
      renderAt(oldPage);
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    },
  );

  it('should send other query strings to the dashboard, not the profile page', () => {
    renderAt('/credit-cards?utm_source=bookmark');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
