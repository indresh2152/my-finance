import { renderHook, act, waitFor } from '@testing-library/react';
import { onTestFinished, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider, useAuth, type AuthContextValue } from './AuthContext';
import apiClient, { getAccessToken, refreshAccessToken } from '../services/api';
import { redirectTo } from '../services/navigation';
import { deferred, settle } from '../test/deferred';
import React from 'react';

vi.mock('../services/navigation', () => ({ redirectTo: vi.fn() }));

const LOGIN_RESPONSE = {
  accessToken: 'mock-access-token',
  user: { id: 'user-1', username: 'testuser', email: 'test@example.com', hasPan: false },
};

const server = setupServer(
  http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
  http.post('/api/v1/auth/login', () => HttpResponse.json(LOGIN_RESPONSE)),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      hasPan: false,
      panMasked: null,
    }),
  ),
  http.delete('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  it('should start with isLoading: true then resolve to user: null when refresh fails', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('should restore session when refresh succeeds', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toMatchObject({ username: 'testuser', hasPan: false });
  });

  it('should send a single refresh when StrictMode runs the restore effect twice', async () => {
    let refreshCalls = 0;
    server.use(
      http.post('/api/v1/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: 'restored-token' });
      }),
    );
    const strictWrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
      <React.StrictMode>{wrapper({ children })}</React.StrictMode>
    );
    const { result } = renderHook(() => useAuth(), { wrapper: strictWrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());
    expect(refreshCalls).toBe(1);
  });

  it.each([
    ['logout', '/api/v1/auth/logout', (auth: AuthContextValue) => auth.logout()],
    ['login', '/api/v1/auth/login', (auth: AuthContextValue) => auth.login('testuser', 'pass')],
  ] as const)('should let an in-flight refresh finish before %s', async (action, url, run) => {
    const order: string[] = [];
    const held = deferred();
    onTestFinished(held.release);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    server.use(
      http.post('/api/v1/auth/refresh', async () => {
        order.push('refresh-start');
        await held.promise;
        order.push('refresh');
        return HttpResponse.json({ accessToken: 'refreshed-token' });
      }),
      http.all(url, () => {
        order.push(action);
        return HttpResponse.json(LOGIN_RESPONSE);
      }),
    );

    // Logout makes this refresh stale, so it may reject; its outcome is not under test here.
    const refresh = refreshAccessToken().catch(() => undefined);
    await waitFor(() => expect(order).toEqual(['refresh-start']));
    const done = act(async () => {
      await run(result.current);
    });
    await settle();
    expect(order).toEqual(['refresh-start']);

    held.release();
    await done;
    await refresh;

    expect(order).toEqual(['refresh-start', 'refresh', action]);
  });

  it('should hold back a refresh that starts during logout and not revive the session', async () => {
    const order: string[] = [];
    const held = deferred();
    onTestFinished(held.release);
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());
    server.use(
      http.delete('/api/v1/auth/logout', async ({ request }) => {
        order.push(`logout auth=${request.headers.get('Authorization') ?? 'none'}`);
        await held.promise;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('/api/v1/auth/refresh', () => {
        order.push('refresh');
        return new HttpResponse(null, { status: 401 });
      }),
      http.get('/api/v1/protected', () =>
        HttpResponse.json({ error: { code: 'INVALID_TOKEN' } }, { status: 401 }),
      ),
    );

    const done = act(async () => {
      await result.current.logout();
    });
    await waitFor(() => expect(order).toEqual(['logout auth=none']));
    const failure = apiClient.get('/protected').catch((err: unknown) => err);
    await settle();
    expect(order).toEqual(['logout auth=none']);

    held.release();
    await done;
    expect(await failure).toMatchObject({ response: { status: 401 } });

    expect(order).toEqual(['logout auth=none', 'refresh']);
    expect(getAccessToken()).toBeNull();
    expect(result.current.user).toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it.each([
    [
      'loads',
      () =>
        HttpResponse.json({
          id: 'old-user',
          username: 'olduser',
          email: 'old@example.com',
          hasPan: true,
          panMasked: 'ABCDE####F',
        }),
    ],
    ['fails', () => new HttpResponse(null, { status: 500 })],
  ])('should keep a login that finished while the restored profile %s', async (_c, respond) => {
    const held = deferred();
    onTestFinished(held.release);
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'old-session' })),
      http.get('/api/v1/users/me', async () => {
        await held.promise;
        return respond();
      }),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(getAccessToken()).toBe('old-session'));

    await act(async () => {
      await result.current.login('testuser', 'pass');
    });
    held.release();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toMatchObject({ username: 'testuser' });
    expect(getAccessToken()).toBe('mock-access-token');
  });

  it('should set user after login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('testuser', 'password123');
    });
    expect(result.current.user).toMatchObject({ username: 'testuser', hasPan: false });
  });

  it('should clear user after logout', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();
  });

  it('should set panSkipped after skipPan and reset it on logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.panSkipped).toBe(false);
    act(() => {
      result.current.skipPan();
    });
    expect(result.current.panSkipped).toBe(true);
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.panSkipped).toBe(false);
  });

  it('should update hasPan after setPan', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('testuser', 'pass');
    });
    act(() => {
      result.current.setPan('ABCDE####F');
    });
    expect(result.current.user?.hasPan).toBe(true);
    expect(result.current.user?.panMasked).toBe('ABCDE####F');
  });

  it('should throw when useAuth is called outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within AuthProvider');
    consoleError.mockRestore();
  });
});
