import { postPrepAdjustmentRepository } from '../repositories/postPrepAdjustmentRepository';
import { userRepository } from '../repositories/userRepository';
import { auditService } from './auditService';
import { ROLE_CODE_PREFIX, hashPin, normalizePhone, validatePin, VALID_ROLES } from '../lib/utils/auth';
import { createId } from '../lib/utils/id';

function assertManager(currentUser) {
  if (!currentUser || currentUser.role !== 'manager') {
    throw new Error('Only manager can perform this action.');
  }
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
};
