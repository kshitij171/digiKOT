import { randomBytes } from 'node:crypto';
import { SETUP_TOKEN_TTL_MS } from './setupStore.js';

export function getBearerToken(request) {
  const h = request.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export function requireSetupToken(store, request) {
  const token = getBearerToken(request);
  if (!token) return { ok: false, status: 401, error: 'Missing setup token' };
  const entry = store.tokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) store.tokens.delete(token);
    return { ok: false, status: 401, error: 'Invalid or expired setup token' };
  }
  return { ok: true, token };
}

export function issueSetupToken(store) {
  const token = randomBytes(24).toString('hex');
  store.tokens.set(token, { expiresAt: Date.now() + SETUP_TOKEN_TTL_MS });
  return token;
}
