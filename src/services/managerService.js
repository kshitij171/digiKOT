import { postPrepAdjustmentRepository } from '../repositories/postPrepAdjustmentRepository';
import { userRepository } from '../repositories/userRepository';
import { auditService } from './auditService';
import { normalizePhone, VALID_ROLES } from '../lib/utils/auth';
import { createId } from '../lib/utils/id';

function assertManager(currentUser) {
  if (!currentUser || currentUser.role !== 'manager') {
    throw new Error('Only manager can perform this action.');
  }
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
 * The old nextCodeForRole used listUsers() which filters deleted_at IS NULL,
 * causing collisions when previously-deleted users' codes were recycled.
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
      if (!VALID_ROLES.includes(normalizedRole)) throw new Error('Invalid role selected.');

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
};
