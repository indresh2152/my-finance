import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { renderWithProviders } from '../test/renderWithProviders';
import { LinkedEmailRedirect } from './LinkedEmailRedirect';

const LocationProbe = (): ReactElement => {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
};

describe('LinkedEmailRedirect', () => {
  it('should send the old From Email page to Credit Cards, keeping the OAuth result', () => {
    renderWithProviders(
      <Routes>
        <Route path="/linked-email" element={<LinkedEmailRedirect />} />
        <Route path="/credit-cards" element={<LocationProbe />} />
      </Routes>,
      { initialEntries: ['/linked-email?error=MAILBOX_ACCESS_DENIED'] },
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/credit-cards?error=MAILBOX_ACCESS_DENIED',
    );
  });
});
