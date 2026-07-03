const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const apiClient = {
  async login(pinHash) {
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ pinHash }) });
  },
  async logout() {
    return apiFetch('/auth/logout', { method: 'POST' });
  },
  async me() {
    return apiFetch('/auth/me');
  },
  async select(table, options = {}) {
    return apiFetch('/data/select', { method: 'POST', body: JSON.stringify({ table, options }) });
  },
  async insert(table, payload) {
    return apiFetch('/data/insert', { method: 'POST', body: JSON.stringify({ table, payload }) });
  },
  async update(table, payload, filters = []) {
    return apiFetch('/data/update', { method: 'POST', body: JSON.stringify({ table, payload, filters }) });
  },
  async delete(table, filters = []) {
    return apiFetch('/data/delete', { method: 'POST', body: JSON.stringify({ table, filters }) });
  },
  async query(name, body = {}) {
    return apiFetch('/query', { method: 'POST', body: JSON.stringify({ name, body }) });
  },
};
