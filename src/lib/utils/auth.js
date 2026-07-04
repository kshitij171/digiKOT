import { sha256Hex } from './sha256.js';

export const ROLE_ROUTE_MAP = {
  waiter: '/waiter',
  kitchen_supervisor: '/kitchen',
  manager: '/manager',
  owner: '/manager',
};

export const VALID_ROLES = Object.keys(ROLE_ROUTE_MAP);
export const MANAGER_ACCESS_ROLES = ['manager', 'owner'];
const STAFF_CREATABLE_ROLES_BY_ACTOR = {
  manager: ['waiter', 'kitchen_supervisor'],
  owner: ['waiter', 'kitchen_supervisor', 'manager'],
};

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

export function hasManagerAccess(role) {
  return MANAGER_ACCESS_ROLES.includes(role);
}

export function roleSatisfiesRequiredRole(role, requiredRole) {
  if (requiredRole === 'manager') return hasManagerAccess(role);
  return role === requiredRole;
}

export function getCreatableStaffRoles(actorRole) {
  return STAFF_CREATABLE_ROLES_BY_ACTOR[actorRole] || [];
}

export function canCreateStaffRole(actorRole, targetRole) {
  return getCreatableStaffRoles(actorRole).includes(targetRole);
}
