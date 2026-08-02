import {
  devLog,
  initDevLogSession,
  isDevLogEnabled,
  peekTraceId,
} from '../devLog.js';
import { createId } from '../utils/id.js';

const API_BASE = '/api';
/** localStorage survives mobile tab discards better than sessionStorage on LAN tablets. */
const TOKEN_KEY = 'digikot_token';
const DEFAULT_TIMEOUT_MS = 10000;
const LOGIN_TIMEOUT_MS = 8000;

export function getSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function clearSessionToken() {
  setSessionToken(null);
}

function buildHeaders(options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getSessionToken();
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  let requestId;
  let traceId;
  if (isDevLogEnabled()) {
    if (!options._sessionReady) initDevLogSession();
    traceId = options.traceId || peekTraceId();
    requestId = createId();
    if (traceId) headers['X-Trace-Id'] = traceId;
    if (options.sessionId) headers['X-Session-Id'] = options.sessionId;
    try {
      const sid = sessionStorage.getItem('digikot_dev_session');
      if (sid) headers['X-Session-Id'] = sid;
    } catch {
      // ignore
    }
    headers['X-Request-Id'] = requestId;
  }
  // Always return the same shape — callers destructure `{ headers }`.
  return { headers, requestId, traceId };
}

async function apiFetch(path, options = {}) {
  const { headers, requestId, traceId } = buildHeaders(options);
  const {
    traceId: _t,
    sessionId: _s,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Caller-supplied signal (if any) should also abort us.
  if (fetchOptions.signal) {
    if (fetchOptions.signal.aborted) controller.abort();
    else {
      fetchOptions.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      credentials: 'include',
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(
        'Server took too long to respond. On the PC confirm npm run dev:all is running, then open http://<pc-wifi-ip>:5173 (see terminal for the IP).'
      );
    }
    const msg = err?.message || 'Network error';
    throw new Error(
      msg.includes('fetch') || msg.includes('Network')
        ? 'Cannot reach the server. Open http://<pc-wifi-ip>:5173 on this device (same Wi‑Fi) while the PC runs npm run dev:all.'
        : msg
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (isDevLogEnabled()) {
    const meta = { path, status: res.status, method: fetchOptions.method || 'GET', requestId };
    if (!res.ok) {
      const errBody = await res.clone().json().catch(() => ({}));
      devLog('api.error', {
        traceId,
        requestId,
        message: errBody.error || `API ${res.status}`,
        meta,
      });
      throw new Error(errBody.error || `API ${res.status}`);
    }
  } else if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const apiClient = {
  async login(pinHash, options = {}) {
    if (!pinHash) throw new Error('pinHash required');
    // Keep body last so callers cannot overwrite the PIN payload.
    const res = await apiFetch('/auth/login', {
      ...options,
      method: 'POST',
      body: JSON.stringify({ pinHash }),
      timeoutMs: LOGIN_TIMEOUT_MS,
    });
    if (res?.token) setSessionToken(res.token);
    return res;
  },
  async logout(options = {}) {
    try {
      return await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
        timeoutMs: 5000,
        ...options,
      });
    } finally {
      clearSessionToken();
    }
  },
  async me(options = {}) {
    return apiFetch('/auth/me', { timeoutMs: 8000, ...options });
  },
  async select(table, selectOptions = {}, fetchOptions = {}) {
    return apiFetch('/data/select', {
      method: 'POST',
      body: JSON.stringify({ table, options: selectOptions }),
      ...fetchOptions,
    });
  },
  async insert(table, payload, fetchOptions = {}) {
    return apiFetch('/data/insert', {
      method: 'POST',
      body: JSON.stringify({ table, payload }),
      ...fetchOptions,
    });
  },
  async update(table, payload, filters = [], fetchOptions = {}) {
    return apiFetch('/data/update', {
      method: 'POST',
      body: JSON.stringify({ table, payload, filters }),
      ...fetchOptions,
    });
  },
  async delete(table, filters = [], fetchOptions = {}) {
    return apiFetch('/data/delete', {
      method: 'POST',
      body: JSON.stringify({ table, filters }),
      ...fetchOptions,
    });
  },
  async query(name, body = {}, fetchOptions = {}) {
    return apiFetch('/query', {
      method: 'POST',
      body: JSON.stringify({ name, body }),
      ...fetchOptions,
    });
  },
};
