import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { settle } from '../test/deferred';
import { AuthProvider } from '../context/AuthContext';
import { UserMenu } from './UserMenu';

const OPEN_MENU = 'Open account menu';

let isSignedIn = true;
const server = setupServer(
  http.post('/api/v1/auth/refresh', () =>
    isSignedIn
      ? HttpResponse.json({ accessToken: 'token' })
      : new HttpResponse(null, { status: 401 }),
  ),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({
      id: '1',
      username: 'johndoe',
      email: 'john@example.com',
      hasPan: true,
      panMasked: 'ABCDE####F',
    }),
  ),
  http.delete('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  isSignedIn = true;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ProfileStub = (): ReactElement => <div>Profile Page</div>;
const LoginStub = (): ReactElement => <div>Login Page</div>;

const renderMenu = (): ReturnType<typeof renderWithProviders> =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/" element={<UserMenu />} />
        <Route path="/profile" element={<ProfileStub />} />
        <Route path="/login" element={<LoginStub />} />
      </Routes>
    </AuthProvider>,
  );

const openMenu = async (): Promise<HTMLElement> => {
  await userEvent.click(await screen.findByRole('button', { name: OPEN_MENU }));
  return screen.findByRole('menu');
};

describe('UserMenu', () => {
  it("should show the user's initial in a circle, upper-cased", async () => {
    renderMenu();
    expect(await screen.findByRole('button', { name: OPEN_MENU })).toHaveTextContent(/^J$/);
  });

  it('should render nothing until a user is signed in', async () => {
    isSignedIn = false;
    renderMenu();
    await settle();
    expect(screen.queryByRole('button', { name: OPEN_MENU })).not.toBeInTheDocument();
  });

  it('should show the username and email with Profile and Sign out options', async () => {
    renderMenu();
    const menu = await openMenu();
    expect(within(menu).getByText('johndoe')).toBeInTheDocument();
    expect(within(menu).getByText('john@example.com')).toBeInTheDocument();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Profile', 'Sign out']);
    // While open, MUI hides everything outside the menu from the accessibility tree.
    expect(screen.getByRole('button', { name: OPEN_MENU, hidden: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('should close the menu on Escape', async () => {
    renderMenu();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('should focus Profile first, skipping the name and email', async () => {
    renderMenu();
    const menu = await openMenu();
    await waitFor(() =>
      expect(within(menu).getByRole('menuitem', { name: 'Profile' })).toHaveFocus(),
    );
  });

  it('should open the profile page and close the menu', async () => {
    renderMenu();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Profile' }));
    expect(await screen.findByText('Profile Page')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('should still finish signing out when the server cannot revoke the session', async () => {
    server.use(http.delete('/api/v1/auth/logout', () => new HttpResponse(null, { status: 500 })));
    renderMenu();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('should sign out and go to the login page', async () => {
    renderMenu();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });
});
