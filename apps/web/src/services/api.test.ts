import { vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import apiClient, {
  AUTH_LOCK_NAME,
  StaleRefreshError,
  apiErrorCode,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
  withAuthLock,
} from './api';
import { redirectTo } from './navigation';
import { deferred, settle, type Deferred } from '../test/deferred';

vi.mock('./navigation', () => ({ redirectTo: vi.fn() }));

const REFRESH_URL = '/api/v1/auth/refresh';
const NEW_TOKEN = 'new-access-token';

const server = setupServer();

let refreshCalls = 0;

/** Counts refresh calls; succeeds with NEW_TOKEN or fails with 401, after `held` if given. */
const mockRefresh = (succeeds: boolean, held?: Deferred): void => {
  server.use(
    http.post(REFRESH_URL, async () => {
      refreshCalls += 1;
      await held?.promise;
      return succeeds
        ? HttpResponse.json({ accessToken: NEW_TOKEN })
        : new HttpResponse(null, { status: 401 });
    }),
  );
};

/** Like mockRefresh, but holds the response until release() is called. */
const mockHeldRefresh = (succeeds = true): Deferred => {
  const held = deferred();
  mockRefresh(succeeds, held);
  return held;
};

const unauthorized = (code: string): Response =>
  HttpResponse.json({ error: { code, message: 'Unauthorized' } }, { status: 401 });

/** Responds 401 INVALID_TOKEN until the request carries the refreshed token. */
const protectedEndpoint = (path: string, authorizedStatus = 200): void => {
  server.use(
    http.get(`/api/v1${path}`, ({ request }) =>
      request.headers.get('Authorization') === `Bearer ${NEW_TOKEN}`
        ? HttpResponse.json({ ok: true }, { status: authorizedStatus })
        : unauthorized('INVALID_TOKEN'),
    ),
  );
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  refreshCalls = 0;
  setAccessToken('stale-token');
  vi.mocked(redirectTo).mockClear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('refreshAccessToken', () => {
  it('should share one refresh request between concurrent callers', async () => {
    mockRefresh(true);

    const tokens = await Promise.all([refreshAccessToken(), refreshAccessToken()]);

    expect(tokens).toEqual([NEW_TOKEN, NEW_TOKEN]);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe(NEW_TOKEN);
  });

  it('should start a new refresh once the previous one has settled', async () => {
    mockRefresh(true);

    await refreshAccessToken();
    await refreshAccessToken();

    expect(refreshCalls).toBe(2);
  });

  it('should reject every concurrent caller when the refresh fails, then allow a retry', async () => {
    mockRefresh(false);

    const results = await Promise.allSettled([refreshAccessToken(), refreshAccessToken()]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(refreshCalls).toBe(1);

    mockRefresh(true);
    await expect(refreshAccessToken()).resolves.toBe(NEW_TOKEN);
  });
});

describe('apiClient 401 handling', () => {
  it('should refresh once for concurrent 401s and retry each request with the new token', async () => {
    mockRefresh(true);
    protectedEndpoint('/a');
    protectedEndpoint('/b');

    const [a, b] = await Promise.all([apiClient.get('/a'), apiClient.get('/b')]);

    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('should clear the token and redirect to login when the refresh fails', async () => {
    mockRefresh(false);
    protectedEndpoint('/a');

    await expect(apiClient.get('/a')).rejects.toMatchObject({ response: { status: 401 } });

    expect(getAccessToken()).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith('/login');
  });

  it('should not redirect to login when the retried request fails for another reason', async () => {
    mockRefresh(true);
    protectedEndpoint('/a', 500);

    await expect(apiClient.get('/a')).rejects.toMatchObject({ response: { status: 500 } });

    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('should refresh an expired token for a request that wants a blob', async () => {
    mockRefresh(true);
    protectedEndpoint('/file');
    const res = await apiClient.get('/file', { responseType: 'blob' });
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
  });

  it('should decode a JSON error body sent to a blob request', async () => {
    server.use(
      http.get('/api/v1/file', () =>
        HttpResponse.json({ error: { code: 'NOT_THERE', message: 'x' } }, { status: 404 }),
      ),
    );
    const err: unknown = await apiClient
      .get('/file', { responseType: 'blob' })
      .catch((e: unknown) => e);
    expect(apiErrorCode(err)).toBe('NOT_THERE');
  });

  it('should leave a non-JSON error body sent to a blob request as a blob', async () => {
    server.use(http.get('/api/v1/file', () => new HttpResponse('oops', { status: 502 })));
    const err: unknown = await apiClient
      .get('/file', { responseType: 'blob' })
      .catch((e: unknown) => e);
    expect(apiErrorCode(err)).toBeNull();
  });

  it('should pass non-401 errors through without refreshing', async () => {
    server.use(http.get('/api/v1/a', () => new HttpResponse(null, { status: 404 })));

    await expect(apiClient.get('/a')).rejects.toMatchObject({ response: { status: 404 } });

    expect(refreshCalls).toBe(0);
  });

  it('should refresh when the request was sent without a token', async () => {
    mockRefresh(true);
    setAccessToken(null);
    server.use(
      http.get('/api/v1/a', ({ request }) =>
        request.headers.get('Authorization')
          ? HttpResponse.json({ ok: true })
          : unauthorized('UNAUTHORIZED'),
      ),
    );

    await expect(apiClient.get('/a')).resolves.toMatchObject({ data: { ok: true } });
    expect(refreshCalls).toBe(1);
  });

  it.each([
    ['a wrong password', unauthorized('INVALID_CREDENTIALS')],
    ['a 401 without an error code', new HttpResponse(null, { status: 401 })],
  ])('should not refresh or redirect on %s', async (_case, response) => {
    server.use(http.post('/api/v1/auth/login', () => response));

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshCalls).toBe(0);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it.each([
    ['succeeded', true],
    ['failed', false],
  ])('should leave the token alone and not redirect when a stale refresh %s', async (_c, ok) => {
    const { release } = mockHeldRefresh(ok);
    protectedEndpoint('/a');

    const request = apiClient.get('/a');
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    setAccessToken('login-token');
    release();

    await expect(request).rejects.toMatchObject({ response: { status: 401 } });
    expect(getAccessToken()).toBe('login-token');
    expect(redirectTo).not.toHaveBeenCalled();
  });
});

describe('refresh session safety', () => {
  const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');

  afterEach(() => {
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
    else Reflect.deleteProperty(navigator, 'locks');
  });

  it('should hold the cross-tab Web Lock while refreshing', async () => {
    mockRefresh(true);
    const request = vi.fn(
      async (_name: string, task: () => Promise<unknown>): Promise<unknown> => task(),
    );
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });

    await expect(refreshAccessToken()).resolves.toBe(NEW_TOKEN);

    expect(request).toHaveBeenCalledWith(AUTH_LOCK_NAME, expect.any(Function));
    expect(refreshCalls).toBe(1);
  });

  it('should not overwrite a token set by login or logout while the refresh was running', async () => {
    const { release } = mockHeldRefresh();

    const refresh = refreshAccessToken();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    setAccessToken(null);
    release();

    await expect(refresh).rejects.toBeInstanceOf(StaleRefreshError);
    expect(getAccessToken()).toBeNull();
  });

  it('should run auth-lock tasks one at a time and keep going after one fails', async () => {
    const order: string[] = [];
    const first = deferred();

    const a = withAuthLock(async () => {
      order.push('a-start');
      await first.promise;
      order.push('a-end');
      throw new Error('a failed');
    });
    const b = withAuthLock(async () => {
      order.push('b');
      return 'b-result';
    });
    await vi.waitFor(() => expect(order).toEqual(['a-start']));
    first.release();

    await expect(a).rejects.toThrow('a failed');
    await expect(b).resolves.toBe('b-result');
    expect(order).toEqual(['a-start', 'a-end', 'b']);
  });

  it('should hold back a refresh until a running auth-lock task finishes', async () => {
    mockRefresh(true);
    const logout = deferred();
    const task = withAuthLock(() => logout.promise);

    const refresh = refreshAccessToken();
    await settle();
    expect(refreshCalls).toBe(0);

    logout.release();
    await task;
    await expect(refresh).resolves.toBe(NEW_TOKEN);
    expect(refreshCalls).toBe(1);
  });
});
