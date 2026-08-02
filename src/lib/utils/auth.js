import { sha256Hex } from './sha256.js';

export const ROLE_ROUTE_MAP = {
  waiter: '/waiter',
  kitchen_supervisor: '/kitchen',
  manager: '/manager',
  owner: '/manager',
};

/** Roles that may be assigned to staff accounts (never includes owner). */
export const STAFF_ROLES = ['waiter', 'kitchen_supervisor', 'manager'];

/** All login roles including owner. */
export const VALID_ROLES = Object.keys(ROLE_ROUTE_MAP);

/** Manager-access roles share /manager and manager APIs. */
export const MANAGER_ACCESS_ROLES = ['manager', 'owner'];

export function isManagerAccessRole(role) {
  return MANAGER_ACCESS_ROLES.includes(role);
}

/**
 * Whether `role` satisfies a route guard that requires `requiredRole`.
 * Owner is treated as manager-access for /manager and /pager-register.
 */
export function roleSatisfiesRequiredRole(role, requiredRole) {
  if (!requiredRole) return true;
  if (role === requiredRole) return true;
  if (requiredRole === 'manager' && isManagerAccessRole(role)) return true;
  return false;
}

/** Roles the actor may create in Staff → Add staff. */
export function getCreatableStaffRoles(actorRole) {
  if (actorRole === 'owner') return ['waiter', 'kitchen_supervisor', 'manager'];
  if (actorRole === 'manager') return ['waiter', 'kitchen_supervisor'];
  return [];
}

export function canCreateStaffRole(actorRole, targetRole) {
  return getCreatableStaffRoles(actorRole).includes(targetRole);
}

export function roleDisplayLabel(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'manager') return 'Manager';
  if (role === 'kitchen_supervisor') return 'Kitchen Supervisor';
  if (role === 'waiter') return 'Waiter';
  return role || 'Staff';
}

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
