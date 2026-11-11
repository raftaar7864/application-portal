import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem('recruitment_user') || 'null'); } catch { return null; } });
  const [initializing, setInitializing] = useState(Boolean(sessionStorage.getItem('recruitment_token')));
  useEffect(() => {
    if (!sessionStorage.getItem('recruitment_token')) return;
    api('/auth/me').then(r => {
      setUser(r.user); sessionStorage.setItem('recruitment_user', JSON.stringify(r.user));
    }).catch(() => {
      sessionStorage.removeItem('recruitment_token'); sessionStorage.removeItem('recruitment_user'); setUser(null);
    }).finally(() => setInitializing(false));
  }, []);
  const enter = (data) => {
    sessionStorage.setItem('recruitment_token', data.token);
    sessionStorage.setItem('recruitment_user', JSON.stringify(data.user));
    setUser(data.user);
  };
  const logout = () => {
    sessionStorage.removeItem('recruitment_token'); sessionStorage.removeItem('recruitment_user'); setUser(null);
  };
  return <Context.Provider value={{ user, enter, logout, initializing }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
