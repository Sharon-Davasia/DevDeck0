import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setBooting(false);
      return null;
    }
    try {
      const res = await api.get('/auth/me');
      setUser(res.user);
      return res.user;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const demoLogin = useCallback(async () => {
    const res = await api.post('/auth/demo');
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, register, demoLogin, logout, updateUser, refresh, setUser }),
    [user, booting, login, register, demoLogin, logout, updateUser, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
