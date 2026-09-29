import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import { redirectTo } from './navigation';

let accessToken: string | null = null;
/** Bumped whenever login or logout replaces the token, so an older refresh cannot overwrite it. */
let sessionGeneration = 0;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
  sessionGeneration += 1;
};

export const getAccessToken = (): string | null => accessToken;

const clientConfig = {
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
};

const apiClient: AxiosInstance = axios.create(clientConfig);

/**
 * For the session endpoints (refresh, login, logout). It has no interceptors: these calls send no
 * access token, and a 401 from them must never start a refresh.
 */
export const authClient: AxiosInstance = axios.create(clientConfig);

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    if (accessToken) {
      config.headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return config;
  },
);

/** Web Lock held while a request sends or replaces the refresh cookie. */
export const AUTH_LOCK_NAME = 'my-finance-auth';

/**
 * 401 codes meaning the access token is missing or expired, so a refresh can help. Others, such as
 * INVALID_CREDENTIALS from a wrong password, go straight back to the caller.
 */
const SESSION_EXPIRED_CODES = new Set(['INVALID_TOKEN', 'UNAUTHORIZED']);

/** The `error.code` of an API error response, or null for anything else. */
export const apiErrorCode = (err: unknown): string | null => {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as { error?: { code?: string } } | undefined;
  return data?.error?.code ?? null;
};

/** FileReader rather than Blob.text(), which older engines (and jsdom) lack. */
const readBlobText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.onerror = (): void => reject(reader.error ?? new Error('Failed to read the response'));
    reader.readAsText(blob);
  });

/**
 * A request made with responseType 'blob' gets its JSON error body as a Blob too. Decoding it here,
 * before the refresh check, lets file downloads refresh an expired token and report error codes.
 */
const decodeBlobErrorBody = async (error: AxiosError): Promise<void> => {
  const { response } = error;
  if (!(response?.data instanceof Blob)) return;
  try {
    response.data = JSON.parse(await readBlobText(response.data)) as unknown;
  } catch {
    // Not JSON: leave the body as it is.
  }
};

const isSessionExpired = (error: AxiosError): boolean =>
  error.response?.status === 401 && SESSION_EXPIRED_CODES.has(apiErrorCode(error) ?? '');

/** The session changed (login or logout) while a refresh was running; its token is discarded. */
export class StaleRefreshError extends Error {
  constructor() {
    super('Session changed during token refresh');
    this.name = 'StaleRefreshError';
  }
}

let localAuthQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs requests that send or replace the refresh cookie (refresh, login, logout) one at a time.
 * The server rotates that cookie and treats a reused one as theft, revoking every session, so each
 * request must go out with the cookie the previous one left. The Web Lock spans tabs, which share
 * the cookie jar; where Web Locks are missing (insecure contexts, jsdom) an in-tab queue stands in.
 */
export const withAuthLock = async <T>(task: () => Promise<T>): Promise<T> => {
  if ('locks' in navigator) return await navigator.locks.request(AUTH_LOCK_NAME, task);
  const run = localAuthQueue.then(task, task);
  localAuthQueue = run.catch(() => undefined);
  return run;
};

let refreshInFlight: Promise<string> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers in this tab share one
 * request. If login or logout replaced the token meanwhile, the outcome belongs to the old session
 * and it rejects with StaleRefreshError instead.
 */
export const refreshAccessToken = (): Promise<string> => {
  const generation = sessionGeneration;
  const assertCurrent = (): void => {
    if (generation !== sessionGeneration) throw new StaleRefreshError();
  };
  refreshInFlight ??= withAuthLock(() => authClient.post<{ accessToken: string }>('/auth/refresh'))
    .then(
      ({ data }) => {
        assertCurrent();
        accessToken = data.accessToken;
        return data.accessToken;
      },
      (refreshError: unknown) => {
        assertCurrent();
        throw refreshError;
      },
    )
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
};

apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;
    await decodeBlobErrorBody(error);

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (originalRequest._retry || !isSessionExpired(error)) {
      throw error;
    }

    originalRequest._retry = true;

    let token: string;
    try {
      token = await refreshAccessToken();
    } catch (refreshError) {
      // A newer login or logout owns the token now; leave it and the page alone.
      if (refreshError instanceof StaleRefreshError) throw error;
      setAccessToken(null);
      redirectTo('/login');
      throw error;
    }

    originalRequest.headers.set('Authorization', `Bearer ${token}`);
    return apiClient(originalRequest);
  },
);

export default apiClient;
