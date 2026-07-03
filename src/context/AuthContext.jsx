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
  const loginWithPinHash = async (pinHash) => {
    const user = await authService.loginWithPinHash(pinHash);

    let waiterSessionId = null;
    if (user.role === 'waiter') {
      waiterSessionId = await waiterSessionService.openSession(
        user.id,
        window.navigator?.userAgent?.slice(0, 120) || null
      );
    }

    const next = {
      user,
      role: user.role,
      waiterSessionId,
      // Kitchen supervisor identity — used for KOT first-touch ownership tagging
      supervisorId: user.role === 'kitchen_supervisor' ? user.id : null,
      supervisorName: user.role === 'kitchen_supervisor' ? (user.username || user.name || null) : null,
    };
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
    try {
      const { apiClient } = await import('../lib/api/apiClient');
      await apiClient.logout();
    } catch {
      /* ignore */
    }
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const value = useMemo(() => {
    const user = session?.user || null;
    const role = session?.role || user?.role || null;
    const isKitchenSupervisor = role === 'kitchen_supervisor';
    // Backfill from user when session was saved before supervisorId was added
    const supervisorId =
      session?.supervisorId || (isKitchenSupervisor && user?.id ? user.id : null);
    const supervisorName =
      session?.supervisorName ||
      (isKitchenSupervisor && user ? user.name || user.username || null : null);
    return {
      currentUser: user,
      role,
      supervisorId,
      supervisorName,
      loginWithPinHash,
      logoutUser,
    };
  }, [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
