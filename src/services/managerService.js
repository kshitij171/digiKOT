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

  async registerStaff({ managerUser, name, phone, role, pin }) {
    assertManager(managerUser);
    if (!VALID_ROLES.includes(role)) throw new Error('Invalid role selected.');
    const cleanedName = String(name || '').trim();
    if (!cleanedName) throw new Error('Name is required.');
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw new Error('Phone number is required.');
    if (!validatePin(pin)) throw new Error('PIN must be 4-6 digits.');

    const existing = await userRepository.findByPhoneAndRole(normalizedPhone, role).catch(() => null);
    if (existing) throw new Error('Staff with this phone and role already exists.');

    const code = await nextCodeForRole(role);
    const userId = createId();
    const now = new Date().toISOString();
    await userRepository.createUser({
      id: userId,
      role,
      code,
      name: cleanedName,
      phone: normalizedPhone,
      pin_hash: await hashPin(pin),
      active: true,
      created_at: now,
      updated_at: now,
    });

    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'STAFF_CREATED',
      entity_type: 'user',
      entity_id: userId,
      after_json: { code, role, name: cleanedName, phone: normalizedPhone },
    });

    return { userId, code };
  },

  async listStaff({ managerUser }) {
    assertManager(managerUser);
    return userRepository.listUsers();
  },

  async resetStaffPin({ managerUser, phone, role, newPin }) {
    assertManager(managerUser);
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw new Error('Phone number is required.');
    if (!validatePin(newPin)) throw new Error('PIN must be 4-6 digits.');
    const user = await userRepository.findByPhoneAndRole(normalizedPhone, role);
    if (!user) throw new Error('User not found for this phone and role.');
    await userRepository.updatePinByUserId(user.id, await hashPin(newPin));
    await auditService.log({
      actor_user_id: managerUser.id,
      action: 'STAFF_PIN_RESET',
      entity_type: 'user',
      entity_id: user.id,
      remarks: `${role}:${normalizedPhone}`,
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
