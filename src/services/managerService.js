import { postPrepAdjustmentRepository } from '../repositories/postPrepAdjustmentRepository';
import { pagerRepository } from '../repositories/pagerRepository';
import { userRepository } from '../repositories/userRepository';
import { billingRepository } from '../repositories/billingRepository';
import { isValidDeviceCode, labelForDeviceCode } from '../lib/pagerPool';
import { auditService } from './auditService';
import {
  canCreateStaffRole,
  isManagerAccessRole,
  normalizePhone,
  STAFF_ROLES,
} from '../lib/utils/auth';
import { createId } from '../lib/utils/id';

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function waiterActivityKey(row) {
  if (row?.waiter_user_id) return `id:${row.waiter_user_id}`;
  const username = normalizeUsername(row?.waiter_username);
  if (username) return `username:${username}`;
  return null;
}

function waiterDisplayName(waiter, row) {
  return waiter?.name || waiter?.username || row?.waiter_username || 'Unknown Waiter';
}

function itemSnapshotName(item) {
  return String(item?.item_name || item?.item_name_snapshot || item?.name || 'Unknown Item').trim() || 'Unknown Item';
}

function assertManager(currentUser) {
  if (!currentUser || !isManagerAccessRole(currentUser.role)) {
    throw new Error('Only manager or owner can perform this action.');
  }
}

const MAC_NORMALIZED_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/** MAC normalization and validation — only use this from managerService (single source of truth). */
function normalizeMacFromInput(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

// Maps every valid role to its code prefix (e.g. kitchen_supervisor → 'KSV').
const ROLE_CODE_LONG_PREFIX = {
  waiter: 'WTR',
  kitchen_supervisor: 'KSV',
  manager: 'MGR',
};

function randomIntInclusive(min, max) {
  // Cryptographically strong randomness; avoids Math.random().
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random generator unavailable.');
  }
  const range = max - min + 1;
  const maxUint32 = 0xffffffff;
  const limit = Math.floor(maxUint32 / range) * range;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return min + (x % range);
}

/**
 * Generates a unique staff code for the given role.
 * Format: PREFIX-NNNN  (e.g. KSV-2291, WTR-8834, MGR-4521)
 *
 * Uniqueness is checked against ALL rows in `users` — including inactive and
 * soft-deleted records — because the UNIQUE (code) constraint covers every row.
 */
async function generateUniqueCode(role) {
  try {
    const prefix = ROLE_CODE_LONG_PREFIX[role];
    if (!prefix) throw new Error(`Unsupported staff role: "${role}".`);

    const MAX_ATTEMPTS = 500;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const digits = randomIntInclusive(1000, 9999);
      const candidate = `${prefix}-${digits}`;
      const taken = await userRepository.codeExists(candidate);
      if (!taken) return candidate;
    }
    throw new Error(`Could not generate a unique code for role "${role}" after ${MAX_ATTEMPTS} attempts.`);
  } catch (err) {
    throw err;
  }
}

export const managerService = {
  /**
   * Waiter performance from cleared bills (stable after table clear).
   */
  async getWaiterPerformance({ managerUser, fromDate, toDate }) {
    try {
      assertManager(managerUser);
      const [staff, clearedBills] = await Promise.all([
        userRepository.listUsers(),
        billingRepository.listClearedBills({ fromDate, toDate }),
      ]);

      const waiters = staff
        .filter((user) => user.role === 'waiter')
        .map((user) => ({
          id: user.id,
          name: user.name,
          username: user.username || null,
          active: user.active,
        }));
      const waitersById = new Map(waiters.map((waiter) => [waiter.id, waiter]));
      const waitersByUsername = new Map(
        waiters
          .filter((waiter) => waiter.username)
          .map((waiter) => [normalizeUsername(waiter.username), waiter]),
      );
      const rowsByKey = new Map();

      const ensureRow = (source) => {
        const waiter =
          (source.waiter_user_id && waitersById.get(source.waiter_user_id)) ||
          waitersByUsername.get(normalizeUsername(source.waiter_username)) ||
          null;
        const key = waiter?.id ? `id:${waiter.id}` : waiterActivityKey(source);
        if (!key) return null;
        if (!rowsByKey.has(key)) {
          rowsByKey.set(key, {
            waiterId: waiter?.id || source.waiter_user_id || null,
            waiterUsername: waiter?.username || source.waiter_username || null,
            waiterName: waiterDisplayName(waiter, source),
            tablesServed: 0,
            itemsProcessed: 0,
          });
        }
        return rowsByKey.get(key);
      };

      clearedBills.forEach((bill) => {
        const row = ensureRow(bill);
        if (!row) return;
        row.tablesServed += 1;
        (bill.bill_items || []).forEach((item) => {
          if (item.include_in_bill === false) return;
          const qty = Number(item.qty);
          row.itemsProcessed += Number.isFinite(qty) ? qty : 0;
        });
      });

      const rows = Array.from(rowsByKey.values()).filter(
        (row) => row.tablesServed > 0 || row.itemsProcessed > 0,
      );

      return { waiters, rows };
    } catch (err) {
      throw err;
    }
  },

  /**
   * Bestsellers from cleared bills (stable after table clear).
   */
  async getBestsellers({ managerUser, fromDate, toDate }) {
    try {
      assertManager(managerUser);
      const clearedBills = await billingRepository.listClearedBills({ fromDate, toDate });
      const rowsByItemName = new Map();

      clearedBills.forEach((bill) => {
        (bill.bill_items || []).forEach((item) => {
          if (item.include_in_bill === false) return;
          const qty = Number(item.qty);
          if (!Number.isFinite(qty) || qty <= 0) return;
          const itemName = itemSnapshotName(item);
          if (!rowsByItemName.has(itemName)) {
            rowsByItemName.set(itemName, {
              itemName,
              totalQuantity: 0,
              avgPrepMinutes: null,
            });
          }
          rowsByItemName.get(itemName).totalQuantity += qty;
        });
      });

      return Array.from(rowsByItemName.values())
        .filter((row) => row.totalQuantity > 0)
        .sort((a, b) => b.totalQuantity - a.totalQuantity);
    } catch (err) {
      throw err;
    }
  },

  async createPostPrepAdjustment({
    managerUserId,
    waiterUserId,
    tableNumber,
    kotItemId,
    reason,
    action = 'remove_from_bill',
    sessionId = null,
  }) {
    try {
      await postPrepAdjustmentRepository.create({
        session_id: sessionId,
        table_number: tableNumber,
        kot_item_id: kotItemId,
        requested_by_waiter_id: waiterUserId,
        approved_by_manager_id: managerUserId,
        reason,
        action,
      });
      await auditService.log({
        actor_user_id: managerUserId,
        action: 'post_prep_adjustment',
        entity_type: 'kot_item',
        entity_id: kotItemId,
        remarks: reason,
        after_json: { action, tableNumber, waiterUserId },
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Create a new staff member.
   * For waiters: username is required and must be unique.
   * For all roles: PIN must be unique across all active users.
   */
  async registerStaff({ managerUser, name, phone, username, role, pinHash }) {
    try {
      assertManager(managerUser);

      // Normalize role: accept any casing/spacing from the frontend and coerce
      // to the canonical lowercase-underscore format the DB expects.
      const normalizedRole = String(role || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_');
      if (!STAFF_ROLES.includes(normalizedRole)) throw new Error('Invalid role selected.');
      if (!canCreateStaffRole(managerUser.role, normalizedRole)) {
        throw new Error(
          normalizedRole === 'manager'
            ? 'Only an owner can create manager accounts.'
            : 'You cannot create staff with that role.'
        );
      }

      const cleanedName = String(name || '').trim();
      if (!cleanedName) throw new Error('Name is required.');

      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) throw new Error('Phone number is required.');

      if (!pinHash) throw new Error('PIN must be exactly 4 digits.');

      const cleanedUsername = String(username || '').trim().toLowerCase();
      if (normalizedRole === 'waiter' && !cleanedUsername) {
        throw new Error('Username is required for waiter accounts.');
      }

      if (cleanedUsername) {
        const existingByUsername = await userRepository.findByUsername(cleanedUsername).catch(() => null);
        if (existingByUsername) throw new Error('Username is already taken. Choose a different one.');
      }

      const existingByPin = await userRepository.findActivePinHash(pinHash).catch(() => null);
      if (existingByPin) throw new Error('This PIN is already in use. Choose a different one.');

      const existing = await userRepository.findByPhoneAndRole(normalizedPhone, normalizedRole).catch(() => null);
      if (existing) throw new Error('A staff member with this phone number and role already exists.');

      const code = await generateUniqueCode(normalizedRole);
      const userId = createId();
      const now = new Date().toISOString();

      const payload = {
        id: userId,
        role: normalizedRole,
        code,
        username: cleanedUsername || null,
        name: cleanedName,
        phone: normalizedPhone,
        pin_hash: pinHash,
        active: true,
        created_at: now,
        updated_at: now,
      };

      try {
        await userRepository.createUser(payload);
      } catch (err) {
        // 23505 = PostgreSQL unique_violation. The code collision window is tiny
        // but possible if two managers submit simultaneously. Retry once with a
        // fresh code rather than surfacing a raw DB error to the frontend.
        if (err?.code === '23505' && String(err?.message).includes('users_code_key')) {
          const retryCode = await generateUniqueCode(normalizedRole);
          payload.code = retryCode;
          await userRepository.createUser(payload);
        } else {
          throw err;
        }
      }

      await auditService.log({
        actor_user_id: managerUser.id,
        action: 'STAFF_CREATED',
        entity_type: 'user',
        entity_id: userId,
        after_json: {
          code: payload.code,
          role: normalizedRole,
          name: cleanedName,
          phone: normalizedPhone,
          username: cleanedUsername || null,
        },
      });

      return { userId, code: payload.code };
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists staff users for manager UI.
   * @param {object} args
   * @param {object} args.managerUser
   * @returns {Promise<Array<object>>}
   */
  async listStaff({ managerUser }) {
    try {
      assertManager(managerUser);
      return userRepository.listUsers();
    } catch (err) {
      throw err;
    }
  },

  /**
   * Reset a waiter's PIN by their username.
   * Validates that the new PIN is not already in use by another active user.
   */
  async resetStaffPin({ managerUser, username, newPinHash }) {
    try {
      assertManager(managerUser);

      const cleanedUsername = String(username || '').trim().toLowerCase();
      if (!cleanedUsername) throw new Error('Username is required.');
      if (!newPinHash) throw new Error('New PIN must be exactly 4 digits.');

      // Use the admin lookup (no deleted_at filter) so the reset works even if the
      // staff member was soft-deleted, and even if the deleted_at column hasn't been
      // added to the DB yet.
      const user = await userRepository.findByUsernameAdmin(cleanedUsername);
      if (!user) throw new Error(`No staff member found with username "${cleanedUsername}". Check for typos.`);

      // Conflict check: make sure no OTHER active user already has this PIN.
      // .catch(() => null) handles the case where deleted_at column doesn't exist yet.
      const conflict = await userRepository.findActivePinHash(newPinHash).catch(() => null);
      if (conflict && conflict.id !== user.id) {
        throw new Error('This PIN is already in use by another staff member. Choose a different one.');
      }

      const { rowsAffected } = await userRepository.updatePinByUserId(user.id, newPinHash);
      if (rowsAffected === 0) {
        throw new Error(
          `PIN update failed: no record was modified for username "${cleanedUsername}" (userId=${user.id}). The user may have been removed. Please refresh the staff list and try again.`
        );
      }
      await auditService.log({
        actor_user_id: managerUser.id,
        action: 'STAFF_PIN_RESET',
        entity_type: 'user',
        entity_id: user.id,
        remarks: `username:${cleanedUsername}`,
      });
    } catch (err) {
      throw err;
    }
  },

  async deactivateStaff({ managerUser, userId }) {
    assertManager(managerUser);
    await pagerRepository.releaseAssignmentsForWaiter(userId);
    await userRepository.setActive(userId, false);
    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'STAFF_DEACTIVATED',
      entity_type: 'user',
      entity_id: userId,
    });
  },

  /**
   * Checks whether a PIN hash is currently unused by any active user.
   * Intended to support a manager-facing "PIN is available" hint without ever
   * returning plaintext PIN values from any service.
   * @param {object} args
   * @param {string} args.pinHash - Hashed PIN from the component boundary.
   * @returns {Promise<{ available: boolean }>}
   */
  async checkPinHashAvailable({ pinHash }) {
    try {
      if (!pinHash) return { available: false };
      const conflict = await userRepository.findActivePinHash(pinHash).catch(() => null);
      return { available: !conflict };
    } catch (err) {
      throw err;
    }
  },

  /**
   * Soft-deletes a staff user and writes an audit log entry.
   * @param {object} args
   * @param {object} args.managerUser
   * @param {string} args.userId
   * @returns {Promise<void>}
   */
  async deleteStaff({ managerUser, userId }) {
    try {
      assertManager(managerUser);
      if (!userId) throw new Error('User ID is required.');
      if (userId === managerUser.id) throw new Error('You cannot remove your own account.');
      const target = await userRepository.findById(userId).catch(() => null);
      if (target?.role === 'owner') throw new Error('Owner accounts cannot be removed.');
      if (target?.role === 'manager' && managerUser.role !== 'owner') {
        throw new Error('Only an owner can remove manager accounts.');
      }
      await userRepository.softDelete(userId);
      await auditService.log({
        actor_user_id: managerUser.id,
        action: 'STAFF_DELETED',
        entity_type: 'user',
        entity_id: userId,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Pager pool: devices (device_code + MAC) and waiter assignments.
   */
  async listPagerDashboard({ managerUser }) {
    assertManager(managerUser);
    const [devices, activeAssignments, staff] = await Promise.all([
      pagerRepository.listDevices(),
      pagerRepository.listActiveAssignments(),
      userRepository.listUsers(),
    ]);
    const byPager = new Map(activeAssignments.map((a) => [a.pager_device_id, a]));
    const waiterIdsWithPager = new Set(activeAssignments.map((a) => a.waiter_user_id));
    const staffById = new Map(staff.map((u) => [u.id, u]));

    const rows = devices.map((d) => {
      const a = byPager.get(d.device_code) || null;
      const waiter = a ? staffById.get(a.waiter_user_id) || null : null;
      return {
        ...d,
        assignment: a,
        waiter: waiter
          ? { id: waiter.id, name: waiter.name, username: waiter.username || null }
          : null,
      };
    });

    const freePagerCodes = devices
      .filter((d) => d.active && !byPager.has(d.device_code))
      .map((d) => d.device_code);

    const eligibleWaiters = staff.filter(
      (u) => u.role === 'waiter' && u.active && !waiterIdsWithPager.has(u.id),
    );

    return { rows, freePagerCodes, eligibleWaiters };
  },

  async assignPagerToWaiter({ managerUser, deviceCode, waiterUserId }) {
    assertManager(managerUser);
    const cleanedCode = String(deviceCode || '').trim().toLowerCase();
    if (!cleanedCode) throw new Error('Pager is required.');

    const waiter = await userRepository.findById(waiterUserId);
    if (!waiter) throw new Error('Waiter not found.');
    if (waiter.role !== 'waiter') throw new Error('Only an active waiter can receive a pager.');
    if (!waiter.active) throw new Error('Cannot assign a pager to an inactive waiter.');

    const devices = await pagerRepository.listDevices();
    const device = devices.find((d) => d.device_code === cleanedCode);
    if (!device || !device.active) throw new Error('That pager is not available.');

    const existingPager = await pagerRepository.findActiveAssignmentForPager(cleanedCode);
    if (existingPager) throw new Error('That pager is already assigned.');

    const existingWaiter = await pagerRepository.findActiveAssignmentForWaiter(waiterUserId);
    if (existingWaiter) throw new Error('That waiter already has a pager. Unassign it first.');

    const now = new Date().toISOString();
    await pagerRepository.insertAssignment({
      id: createId(),
      pager_device_id: cleanedCode,
      waiter_user_id: waiterUserId,
      assigned_at: now,
      released_at: null,
    });

    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'PAGER_ASSIGNED',
      entity_type: 'pager_device',
      entity_id: cleanedCode,
      after_json: { waiter_user_id: waiterUserId, waiter_name: waiter.name },
    });
  },

  async unassignPagerFromDevice({ managerUser, deviceCode }) {
    assertManager(managerUser);
    const cleanedCode = String(deviceCode || '').trim().toLowerCase();
    if (!cleanedCode) throw new Error('Pager is required.');

    const open = await pagerRepository.findActiveAssignmentForPager(cleanedCode);
    if (!open) throw new Error('That pager is not assigned.');

    await pagerRepository.releaseAssignmentForPager(cleanedCode);
    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'PAGER_UNASSIGNED',
      entity_type: 'pager_device',
      entity_id: cleanedCode,
      after_json: { waiter_user_id: open.waiter_user_id },
    });
  },

  /**
   * Register a new pager device (provisioning). MAC is trimmed, uppercased, and validated here only.
   */
  async registerPagerDevice({ managerUser, deviceCode, macAddress: rawMac, label: rawLabel }) {
    assertManager(managerUser);
    const code = String(deviceCode || '').trim().toLowerCase();
    if (!isValidDeviceCode(code)) {
      throw new Error(
        'Invalid device code. Use lowercase letters, numbers, and underscores only (start with a letter, max 64 characters).',
      );
    }

    const mac = normalizeMacFromInput(rawMac);
    if (!MAC_NORMALIZED_REGEX.test(mac)) {
      throw new Error('Invalid MAC format');
    }

    const existingCode = await pagerRepository.findDeviceByCode(code).catch(() => null);
    if (existingCode) {
      throw new Error('Device already exists');
    }

    const existingMac = await pagerRepository.findDeviceByMac(mac).catch(() => null);
    if (existingMac) {
      throw new Error('MAC already registered');
    }

    const cleanedLabel = String(rawLabel ?? '').trim();
    const label = cleanedLabel || labelForDeviceCode(code);
    if (label.length > 120) {
      throw new Error('Label must be at most 120 characters.');
    }

    const devices = await pagerRepository.listDevices();
    const maxOrd = devices.reduce((m, d) => Math.max(m, Number(d.display_order) || 0), 0);

    const now = new Date().toISOString();
    await pagerRepository.insertDevice({
      device_code: code,
      label,
      mac_address: mac,
      display_order: maxOrd + 1,
      active: true,
      created_at: now,
      updated_at: now,
    });

    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'PAGER_DEVICE_REGISTERED',
      entity_type: 'pager_device',
      entity_id: code,
      after_json: { mac_address: mac },
    });
  },

  /** Remove a device row only when it has no active assignment. */
  async deletePagerDeviceIfUnassigned({ managerUser, deviceCode }) {
    assertManager(managerUser);
    const code = String(deviceCode || '').trim().toLowerCase();
    if (!code) throw new Error('Pager is required.');

    const open = await pagerRepository.findActiveAssignmentForPager(code);
    if (open) throw new Error('Cannot delete an assigned pager. Return it to the pool first.');

    await pagerRepository.deleteDevice(code);
    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'PAGER_DEVICE_DELETED',
      entity_type: 'pager_device',
      entity_id: code,
    });
  },
};
