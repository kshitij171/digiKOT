import { sha256Hex } from './sha256.js';

export const ROLE_ROUTE_MAP = {
  waiter: '/waiter',
  kitchen_supervisor: '/kitchen',
  manager: '/manager',
};

export const VALID_ROLES = Object.keys(ROLE_ROUTE_MAP);

export function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[\s-]/g, '');
}

export function validatePin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

/** SHA-256 hex of PIN — identical on localhost and LAN (no secure-context requirement). */
export async function hashPin(pin) {
  return sha256Hex(String(pin ?? ''));
}

export function getRouteForRole(role) {
  return ROLE_ROUTE_MAP[role] || '/waiter';
}
