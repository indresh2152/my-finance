import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient, {
  StaleRefreshError,
  authClient,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
  withAuthLock,
} from '../services/api';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  hasPan: boolean;
  panMasked: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setPan: (panMasked: string) => void;
  panSkipped: boolean;
  skipPan: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface LoginResponse {
  accessToken: string;
  user: { id: string; username: string; email: string; hasPan: boolean };
}

interface MeResponse {
  id: string;
  username: string;
  email: string;
  hasPan: boolean;
  panMasked: string | null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [panSkipped, setPanSkipped] = useState(false);

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    const data = await withAuthLock(async () => {
      const response = await authClient.post<LoginResponse>('/auth/login', { username, password });
      setAccessToken(response.data.accessToken);
      return response.data;
    });
    setUser({
      id: data.user.id,
      username: data.user.username,
      email: data.user.email,
      hasPan: data.user.hasPan,
      panMasked: null,
    });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // Clearing first marks any refresh still running as stale, so it cannot restore the token.
    // Holding the auth lock makes logout revoke whatever cookie the last refresh left.
    setAccessToken(null);
    try {
      await withAuthLock(() => authClient.delete('/auth/logout'));
    } catch {
      // The local session is cleared below either way; a failed server revoke is not the caller's
      // to handle, so logout always resolves.
    } finally {
      // Again after the lock: a refresh queued during logout started after the first clear.
      setAccessToken(null);
      setUser(null);
      setPanSkipped(false);
    }
  }, []);

  const skipPan = useCallback((): void => {
    setPanSkipped(true);
  }, []);

  const setPan = useCallback((panMasked: string): void => {
    setUser((prev) => (prev ? { ...prev, hasPan: true, panMasked } : prev));
  }, []);

  useEffect(() => {
    let restoredToken: string | null = null;
    // True once a login or logout has replaced the session being restored; it owns the state then.
    const superseded = (err?: unknown): boolean =>
      err instanceof StaleRefreshError ||
      (restoredToken !== null && getAccessToken() !== restoredToken);

    const restoreSession = async (): Promise<void> => {
      try {
        restoredToken = await refreshAccessToken();

        const { data: me } = await apiClient.get<MeResponse>('/users/me');
        if (superseded()) return;
        setUser({
          id: me.id,
          username: me.username,
          email: me.email,
          hasPan: me.hasPan,
          panMasked: me.panMasked,
        });
      } catch (err) {
        if (!superseded(err)) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void restoreSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, setPan, panSkipped, skipPan }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
