import React, { createContext, useContext, useMemo, useState } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext();
const SESSION_KEY = 'appSession';

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });

  const loginWithPin = async ({ code, pin, role }) => {
    const user = await authService.loginWithPin(code, pin, role);
    const next = { user, role: user.role };
    setSession(next);
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return user;
  };

  const logoutUser = () => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const value = useMemo(
    () => ({
      currentUser: session?.user || null,
      role: session?.role || null,
      loginWithPin,
      logoutUser,
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
