import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios';

let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

const apiClient: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    if (accessToken) {
      config.headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return config;
  },
);

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

const processQueue = (token: string): void => {
  refreshQueue.forEach((resolve) => resolve(token));
  refreshQueue = [];
};

apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest._retry) {
      throw error;
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token: string) => {
          originalRequest.headers.set('Authorization', `Bearer ${token}`);
          resolve(apiClient(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post<{ accessToken: string }>(
        '/api/v1/auth/refresh',
        {},
        { withCredentials: true },
      );
      setAccessToken(data.accessToken);
      processQueue(data.accessToken);
      originalRequest.headers.set('Authorization', `Bearer ${data.accessToken}`);
      return apiClient(originalRequest);
    } catch {
      setAccessToken(null);
      refreshQueue = [];
      window.location.href = '/login';
      throw error;
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
