import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from './AuthContext';
import React from 'react';

const server = setupServer(
  http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
  http.post('/api/v1/auth/login', () =>
    HttpResponse.json({
      accessToken: 'mock-access-token',
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com', hasPan: false },
    }),
  ),
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
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'restored-token' }),
      ),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toMatchObject({ username: 'testuser', hasPan: false });
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
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'token' }),
      ),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.logout(); });
    expect(result.current.user).toBeNull();
  });

  it('should update hasPan after setPan', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.login('testuser', 'pass'); });
    act(() => { result.current.setPan('ABCDE####F'); });
    expect(result.current.user?.hasPan).toBe(true);
    expect(result.current.user?.panMasked).toBe('ABCDE####F');
  });

  it('should throw when useAuth is called outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within AuthProvider');
    consoleError.mockRestore();
  });
});
