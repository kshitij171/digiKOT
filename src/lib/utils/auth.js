export const ROLE_ROUTE_MAP = {
  waiter: '/waiter',
  kitchen_supervisor: '/kitchen',
  manager: '/manager',
};

export const ROLE_CODE_PREFIX = {
  waiter: 'W',
  kitchen_supervisor: 'K',
  manager: 'M',
};

export const VALID_ROLES = Object.keys(ROLE_ROUTE_MAP);

export function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[\s-]/g, '');
}

export function validatePin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

export async function hashPin(pin) {
  const text = String(pin ?? '');
  if (typeof crypto?.subtle !== 'undefined') {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return `fallback_${hash.toString(16).padStart(8, '0')}`;
}

export function getRouteForRole(role) {
  return ROLE_ROUTE_MAP[role] || '/waiter';
}
