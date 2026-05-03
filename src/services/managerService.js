import { postPrepAdjustmentRepository } from '../repositories/postPrepAdjustmentRepository';
import { pagerRepository } from '../repositories/pagerRepository';
import { userRepository } from '../repositories/userRepository';
import { isValidDeviceCode, labelForDeviceCode } from '../lib/pagerPool';
import { auditService } from './auditService';
import { ROLE_CODE_PREFIX, hashPin, normalizePhone, validatePin, VALID_ROLES } from '../lib/utils/auth';
import { createId } from '../lib/utils/id';

function assertManager(currentUser) {
  if (!currentUser || currentUser.role !== 'manager') {
    throw new Error('Only manager can perform this action.');
  }
}

const MAC_NORMALIZED_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/** MAC normalization and validation — only use this from managerService (single source of truth). */
function normalizeMacFromInput(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

async function nextCodeForRole(role) {
  const prefix = ROLE_CODE_PREFIX[role];
  if (!prefix) throw new Error('Unsupported staff role.');
  const users = await userRepository.listUsers();
  const max = users
    .filter((u) => u.role === role && typeof u.code === 'string' && u.code.startsWith(prefix))
    .map((u) => Number(u.code.slice(1)))
    .filter((n) => Number.isFinite(n))
    .reduce((acc, n) => Math.max(acc, n), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export const managerService = {
  async createPostPrepAdjustment({
    managerUserId,
    waiterUserId,
    tableNumber,
    kotItemId,
    reason,
    action = 'remove_from_bill',
    sessionId = null,
  }) {
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
  },

  /**
   * Create a new staff member.
   * For waiters: username is required and must be unique.
   * For all roles: PIN must be unique across all active users.
   */
  async registerStaff({ managerUser, name, phone, username, role, pin }) {
    assertManager(managerUser);
    if (!VALID_ROLES.includes(role)) throw new Error('Invalid role selected.');

    const cleanedName = String(name || '').trim();
    if (!cleanedName) throw new Error('Name is required.');

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw new Error('Phone number is required.');

    if (!validatePin(pin)) throw new Error('PIN must be exactly 4 digits.');

    const cleanedUsername = String(username || '').trim().toLowerCase();
    if (role === 'waiter' && !cleanedUsername) throw new Error('Username is required for waiter accounts.');

    if (cleanedUsername) {
      const existingByUsername = await userRepository.findByUsername(cleanedUsername).catch(() => null);
      if (existingByUsername) throw new Error('Username is already taken. Choose a different one.');
    }

    const pinHash = await hashPin(pin);
    const existingByPin = await userRepository.findActivePinHash(pinHash).catch(() => null);
    if (existingByPin) throw new Error('This PIN is already in use. Choose a different one.');

    const existing = await userRepository.findByPhoneAndRole(normalizedPhone, role).catch(() => null);
    if (existing) throw new Error('A staff member with this phone number and role already exists.');

    const code = await nextCodeForRole(role);
    const userId = createId();
    const now = new Date().toISOString();

    await userRepository.createUser({
      id: userId,
      role,
      code,
      username: cleanedUsername || null,
      name: cleanedName,
      phone: normalizedPhone,
      pin_hash: pinHash,
      active: true,
      created_at: now,
      updated_at: now,
    });

    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'STAFF_CREATED',
      entity_type: 'user',
      entity_id: userId,
      after_json: { code, role, name: cleanedName, phone: normalizedPhone, username: cleanedUsername || null },
    });

    return { userId, code };
  },

  async listStaff({ managerUser }) {
    assertManager(managerUser);
    return userRepository.listUsers();
  },

  /**
   * Reset a waiter's PIN by their username.
   * Validates that the new PIN is not already in use by another active user.
   */
  async resetStaffPin({ managerUser, username, newPin }) {
    assertManager(managerUser);

    const cleanedUsername = String(username || '').trim().toLowerCase();
    if (!cleanedUsername) throw new Error('Username is required.');
    if (!validatePin(newPin)) throw new Error('New PIN must be exactly 4 digits.');

    const user = await userRepository.findByUsername(cleanedUsername);
    if (!user) throw new Error('No staff member found with that username.');

    const newPinHash = await hashPin(newPin);
    const conflict = await userRepository.findActivePinHash(newPinHash).catch(() => null);
    if (conflict && conflict.id !== user.id) {
      throw new Error('This PIN is already in use. Choose a different one.');
    }

    await userRepository.updatePinByUserId(user.id, newPinHash);
    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'STAFF_PIN_RESET',
      entity_type: 'user',
      entity_id: user.id,
      remarks: `username:${cleanedUsername}`,
    });
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

  async reactivateStaff({ managerUser, userId }) {
    assertManager(managerUser);
    await userRepository.setActive(userId, true);
    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'STAFF_REACTIVATED',
      entity_type: 'user',
      entity_id: userId,
    });
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
