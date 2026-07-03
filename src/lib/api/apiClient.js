import {
  devLog,
  initDevLogSession,
  isDevLogEnabled,
  peekTraceId,
} from '../devLog.js';

const API_BASE = '/api';

function buildHeaders(options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (!isDevLogEnabled()) return headers;
  if (!options._sessionReady) initDevLogSession();
  const traceId = options.traceId || peekTraceId();
  const requestId = crypto.randomUUID();
  if (traceId) headers['X-Trace-Id'] = traceId;
  if (options.sessionId) headers['X-Session-Id'] = options.sessionId;
  try {
    const sid = sessionStorage.getItem('digikot_dev_session');
    if (sid) headers['X-Session-Id'] = sid;
  } catch {
    // ignore
  }
  headers['X-Request-Id'] = requestId;
  return { headers, requestId, traceId };
}

async function apiFetch(path, options = {}) {
  const { headers, requestId, traceId } = buildHeaders(options);
  const { traceId: _t, sessionId: _s, ...fetchOptions } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    credentials: 'include',
    headers,
  });

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
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ pinHash }), ...options });
  },
  async logout(options = {}) {
    return apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({}), ...options });
  },
  async me(options = {}) {
    return apiFetch('/auth/me', options);
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
