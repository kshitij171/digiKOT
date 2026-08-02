import { dbAdapter } from '../lib/db/dbAdapter';
import { apiClient } from '../lib/api/apiClient';

export const userRepository = {
  /**
   * Finds an active, non-deleted user by PIN hash.
   * @param {string} pinHash
   * @returns {Promise<object|null>}
   */
  async findByPinHash(pinHash) {
    try {
      return dbAdapter.select('users', {
        filters: [
          { column: 'pin_hash', value: pinHash },
          { column: 'active', value: true },
          { column: 'deleted_at', operator: 'is', value: null },
        ],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Finds a non-deleted user by username (case-insensitive).
   * @param {string} username
   * @returns {Promise<object|null>}
   */
  async findByUsername(username) {
    try {
      const normalized = String(username || '').trim().toLowerCase();
      return dbAdapter.select('users', {
        filters: [
          { column: 'username', operator: 'ilike', value: normalized },
          { column: 'deleted_at', operator: 'is', value: null },
        ],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Finds a user by PIN hash among active, non-deleted users (conflict check).
   * @param {string} pinHash
   * @returns {Promise<object|null>}
   */
  async findActivePinHash(pinHash) {
    try {
      return dbAdapter.select('users', {
        filters: [
          { column: 'pin_hash', value: pinHash },
          { column: 'active', value: true },
          { column: 'deleted_at', operator: 'is', value: null },
        ],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Inserts a user row.
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async createUser(payload) {
    try {
      return dbAdapter.insert('users', payload);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists non-deleted users (newest first).
   * @returns {Promise<Array<object>>}
   */
  async listUsers() {
    try {
      // Only return non-deleted users; historical attribution (waiter_username snapshots) is preserved
      return apiClient.query('users.listUsers');
    } catch (err) {
      throw err;
    }
  },

  /**
   * Finds a user by phone and (optionally) role.
   * @param {string} phone
   * @param {string} [role]
   * @returns {Promise<object|null>}
   */
  async findByPhoneAndRole(phone, role) {
    try {
      const filters = [
        { column: 'phone', value: phone },
        { column: 'deleted_at', operator: 'is', value: null },
      ];
      if (role) filters.push({ column: 'role', value: role });
      return dbAdapter.select('users', {
        filters,
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Finds a user by id.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findById(userId) {
    try {
      return dbAdapter.select('users', {
        filters: [{ column: 'id', value: userId }],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Admin-level username lookup — does NOT filter by deleted_at.
   * Used for manager operations (PIN reset) so they work regardless of whether
   * the staff member is soft-deleted or whether the deleted_at column exists yet.
   */
  async findByUsernameAdmin(username) {
    try {
      return apiClient.query('users.findByUsernameAdmin', { username });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates a user's PIN hash and reactivates the user (active=true, deleted_at=null).
   * @param {string} userId
   * @param {string} pinHash
   * @returns {Promise<{ rowsAffected: number, updatedUsername: string|null }>}
   */
  async updatePinByUserId(userId, pinHash) {
    try {
      return apiClient.query('users.updatePinByUserId', { userId, pinHash });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Returns true if a staff code is already taken by ANY row —
   * including inactive and soft-deleted users. The UNIQUE (code) constraint
   * covers all rows, so code generation must check the same scope.
   */
  async codeExists(code) {
    try {
      return apiClient.query('users.codeExists', { code });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Returns every pin_hash in the users table with NO filters —
   * includes inactive and soft-deleted records. Used to guarantee that
   * suggested PINs don't collide with any existing PIN, past or present.
   */
  async listAllPinHashes() {
    try {
      return apiClient.query('users.listAllPinHashes');
    } catch (err) {
      throw err;
    }
  },

  /**
   * Soft-deletes a user (sets deleted_at and active=false).
   * @param {string} userId
   * @returns {Promise<any>}
   */
  async softDelete(userId) {
    try {
      const now = new Date().toISOString();
      return dbAdapter.update(
        'users',
        { deleted_at: now, active: false, updated_at: now },
        [{ column: 'id', value: userId }]
      );
    } catch (err) {
      throw err;
    }
  },
};
