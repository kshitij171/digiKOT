/**
 * Server-side access control for generic CRUD and named queries.
 * All authenticated routes must pass these checks before touching SQLite.
 */

const ROLES = {
  ALL: ['waiter', 'kitchen_supervisor', 'manager', 'owner'],
  STAFF: ['waiter', 'kitchen_supervisor', 'manager', 'owner'],
  WAITER_MANAGER: ['waiter', 'manager', 'owner'],
  MANAGER: ['manager', 'owner'],
  KITCHEN_MANAGER: ['kitchen_supervisor', 'manager', 'owner'],
};

/** Tables only managers may read via generic select. */
const MANAGER_SELECT_TABLES = new Set([
  'users',
  'pager_devices',
  'pager_assignments',
  'audit_logs',
]);

/** Tables only managers may insert/update/delete. */
const MANAGER_WRITE_TABLES = new Set([
  'users',
  'pager_devices',
  'pager_assignments',
  'menu_items',
  'categories',
]);

/** Bill fields that imply manager-only financial actions. */
const MANAGER_BILL_FIELDS = new Set([
  'voided_by',
  'voided_at',
  'void_reason',
  'resettled_by',
  'resettled_at',
  'original_payment',
  'new_payment',
  'bill_status',
  'high_discount_flag',
]);

const QUERY_ROLES = {
  'billing.listClearedBills': ROLES.MANAGER,
  'billing.getLatestDraftBillForTable': ROLES.WAITER_MANAGER,
  'billing.getLatestClearedBillForTable': ROLES.WAITER_MANAGER,
  'billing.listVoidBills': ROLES.MANAGER,
  'billing.listResettledBills': ROLES.MANAGER,
  'billing.listHighDiscountBills': ROLES.MANAGER,
  'users.listUsers': ROLES.MANAGER,
  'users.findByUsernameAdmin': ROLES.MANAGER,
  'users.updatePinByUserId': ROLES.MANAGER,
  'users.codeExists': ROLES.MANAGER,
  'users.listAllPinHashes': ROLES.MANAGER,
  'kots.listClearedBySupervisor': ROLES.KITCHEN_MANAGER,
  'kots.listCancelled': ROLES.KITCHEN_MANAGER,
  'kots.assignSupervisor': ROLES.KITCHEN_MANAGER,
  'billMod.listForManager': ROLES.MANAGER,
};

function deny(reply, status, error) {
  reply.code(status).send({ error });
  return false;
}

function hasRole(user, allowed) {
  return allowed.includes(user?.role);
}

function isManagerBillMutation(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return Object.keys(payload).some((k) => MANAGER_BILL_FIELDS.has(k));
}

export function assertSelectAccess(request, reply, table) {
  const { user } = request;
  if (!user) return deny(reply, 401, 'Unauthorized');
  if (MANAGER_SELECT_TABLES.has(table) && !hasRole(user, ROLES.MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  return true;
}

export function assertInsertAccess(request, reply, table) {
  const { user } = request;
  if (!user) return deny(reply, 401, 'Unauthorized');
  if (MANAGER_WRITE_TABLES.has(table) && !hasRole(user, ROLES.MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  if (table === 'cancel_requests' && !hasRole(user, ROLES.STAFF)) {
    return deny(reply, 403, 'Forbidden');
  }
  return true;
}

export function assertUpdateAccess(request, reply, table, payload) {
  const { user } = request;
  if (!user) return deny(reply, 401, 'Unauthorized');

  // Menu catalog edits are manager-only, but kitchen may toggle availability (OOS).
  if (table === 'menu_items') {
    if (hasRole(user, ROLES.MANAGER)) return true;
    if (hasRole(user, ROLES.KITCHEN_MANAGER)) {
      const keys = Object.keys(payload || {});
      const onlyAvailability = keys.length > 0 && keys.every((k) => k === 'out_of_stock' || k === 'updated_at');
      if (onlyAvailability) return true;
    }
    return deny(reply, 403, 'Forbidden');
  }

  if (MANAGER_WRITE_TABLES.has(table) && !hasRole(user, ROLES.MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  if (table === 'bills' && isManagerBillMutation(payload) && !hasRole(user, ROLES.MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  if (table === 'bill_modification_requests' && !hasRole(user, ROLES.MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  if (table === 'cancel_requests' && !hasRole(user, ROLES.STAFF)) {
    return deny(reply, 403, 'Forbidden');
  }
  return true;
}

export function assertDeleteAccess(request, reply, table) {
  const { user } = request;
  if (!user) return deny(reply, 401, 'Unauthorized');
  if (MANAGER_WRITE_TABLES.has(table) && !hasRole(user, ROLES.MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  // Deleting bill rows is manager-only. Waiters may delete bill_items when
  // finalizing a bill on clear-table (replace line items), and may delete
  // cleared kots/kot_items afterward.
  if (table === 'bills' && !hasRole(user, ROLES.MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  if (table === 'bill_items' && !hasRole(user, ROLES.WAITER_MANAGER)) {
    return deny(reply, 403, 'Forbidden');
  }
  return true;
}

export function assertQueryAccess(request, reply, name) {
  const { user } = request;
  if (!user) return deny(reply, 401, 'Unauthorized');
  const allowed = QUERY_ROLES[name];
  if (!allowed) return deny(reply, 404, `Unknown query: ${name}`);
  if (!hasRole(user, allowed)) return deny(reply, 403, 'Forbidden');
  return true;
}

/** Map DB table to Socket.IO domain event (client resync). */
export const TABLE_DOMAIN_EVENTS = {
  kots: 'kots:updated',
  kot_items: 'kots:updated',
  kot_actions: 'kots:updated',
  postprep_adjustments: 'kots:updated',
  restaurant_tables: 'tables:updated',
  table_sessions: 'tables:updated',
  bills: 'tables:updated',
  bill_items: 'tables:updated',
  menu_items: 'menu:updated',
  categories: 'menu:updated',
  notifications: 'notifications:updated',
  cancel_requests: 'cancel_requests:updated',
  audit_logs: 'audit:updated',
  bill_modification_requests: 'bill_modifications:updated',
};

export function domainEventForTable(table) {
  return TABLE_DOMAIN_EVENTS[table] || null;
}
