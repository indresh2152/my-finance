import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import apiClient, { setAccessToken } from '../services/api';

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
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface LoginResponse {
  accessToken: string;
  user: { id: string; username: string; email: string; hasPan: boolean };
}

interface RefreshResponse {
  accessToken: string;
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
  const tokenRef = useRef<string | null>(null);

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', { username, password });
    tokenRef.current = data.accessToken;
    setAccessToken(data.accessToken);
    setUser({
      id: data.user.id,
      username: data.user.username,
      email: data.user.email,
      hasPan: data.user.hasPan,
      panMasked: null,
    });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiClient.delete('/auth/logout');
    } finally {
      tokenRef.current = null;
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const setPan = useCallback((panMasked: string): void => {
    setUser((prev) => (prev ? { ...prev, hasPan: true, panMasked } : prev));
  }, []);

  useEffect(() => {
    const restoreSession = async (): Promise<void> => {
      try {
        const { data } = await axios.post<RefreshResponse>(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );
        tokenRef.current = data.accessToken;
        setAccessToken(data.accessToken);

        const { data: me } = await apiClient.get<MeResponse>('/users/me');
        setUser({
          id: me.id,
          username: me.username,
          email: me.email,
          hasPan: me.hasPan,
          panMasked: me.panMasked,
        });
      } catch {
        tokenRef.current = null;
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void restoreSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, setPan }}>
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
