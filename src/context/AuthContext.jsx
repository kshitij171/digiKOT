import React, { createContext, useContext, useMemo, useState } from 'react';
import { authService } from '../services/authService';
import { waiterSessionService } from '../services/waiterSessionService';

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

  /**
   * Log in with a 4-digit PIN only.
   * Creates a waiter_sessions record for users with the 'waiter' role.
   */
  const loginWithPin = async (pin) => {
    const user = await authService.loginWithPin(pin);

    let waiterSessionId = null;
    if (user.role === 'waiter') {
      waiterSessionId = await waiterSessionService.openSession(
        user.id,
        window.navigator?.userAgent?.slice(0, 120) || null
      );
    }

    const next = { user, role: user.role, waiterSessionId };
    setSession(next);
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return user;
  };

  /**
   * Log out: close the waiter session record if present, then clear state.
   */
  const logoutUser = async () => {
    if (session?.waiterSessionId) {
      await waiterSessionService.closeSession(session.waiterSessionId);
    }
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
