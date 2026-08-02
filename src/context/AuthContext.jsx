import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/authService';
import { waiterSessionService } from '../services/waiterSessionService';
import { apiClient, clearSessionToken, setSessionToken, getSessionToken } from '../lib/api/apiClient';

const AuthContext = createContext();
const SESSION_KEY = 'appSession';

export function useAuth() {
  return useContext(AuthContext);
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Restore bearer token before any /auth/me call (LAN devices rely on this).
    if (parsed?.token) setSessionToken(parsed.token);
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(next) {
  const token = next?.token || getSessionToken();
  const payload = token ? { ...next, token } : next;
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  return payload;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession());
  const [authReady, setAuthReady] = useState(() => !readStoredSession());

  // Validate stored session against the API (cookie and/or bearer token).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readStoredSession();
      if (!stored?.user) {
        if (!cancelled) setAuthReady(true);
        return;
      }
      try {
        const res = await apiClient.me();
        if (!res?.user) throw new Error('no session');
        if (!cancelled) {
          setSession((prev) => {
            const user = res.user;
            const next = {
              ...(prev || stored),
              user,
              role: user.role,
              token: getSessionToken() || stored.token || null,
              supervisorId: user.role === 'kitchen_supervisor' ? user.id : null,
              supervisorName:
                user.role === 'kitchen_supervisor' ? user.username || user.name || null : null,
            };
            writeStoredSession(next);
            return next;
          });
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          localStorage.removeItem(SESSION_KEY);
          clearSessionToken();
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Log in with a 4-digit PIN only.
   * Creates a waiter_sessions record for users with the 'waiter' role.
   */
  const loginWithPinHash = async (pinHash) => {
    const user = await authService.loginWithPinHash(pinHash);
    const token = getSessionToken();

    // Do not await — a hung insert on LAN was leaving the UI on "Verifying…" forever.
    const waiterSessionId = user.role === 'waiter' ? `local_${Date.now()}` : null;
    if (user.role === 'waiter') {
      void waiterSessionService
        .openSession(user.id, window.navigator?.userAgent?.slice(0, 120) || null)
        .catch((err) => console.warn('waiter session open failed:', err));
    }

    const next = {
      user,
      role: user.role,
      token,
      waiterSessionId,
      supervisorId: user.role === 'kitchen_supervisor' ? user.id : null,
      supervisorName: user.role === 'kitchen_supervisor' ? (user.username || user.name || null) : null,
    };
    writeStoredSession(next);
    setSession(next);
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
      await apiClient.logout();
    } catch {
      clearSessionToken();
    }
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const value = useMemo(() => {
    const user = session?.user || null;
    const role = session?.role || user?.role || null;
    const isKitchenSupervisor = role === 'kitchen_supervisor';
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
      authReady,
      loginWithPinHash,
      logoutUser,
    };
  }, [session, authReady]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
