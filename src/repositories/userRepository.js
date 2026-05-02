import { dbAdapter } from '../lib/db/dbAdapter';

export const userRepository = {
  async findByPinHash(pinHash) {
    return dbAdapter.select('users', {
      filters: [
        { column: 'pin_hash', value: pinHash },
        { column: 'active', value: true },
      ],
      single: true,
    });
  },

  async findByUsername(username) {
    return dbAdapter.select('users', {
      filters: [{ column: 'username', value: username }],
      single: true,
    });
  },

  async findActivePinHash(pinHash) {
    return dbAdapter.select('users', {
      filters: [
        { column: 'pin_hash', value: pinHash },
        { column: 'active', value: true },
      ],
      single: true,
    });
  },

  async createUser(payload) {
    return dbAdapter.insert('users', payload);
  },

  async listUsers() {
    return dbAdapter.select('users', {
      orderBy: 'created_at',
      ascending: false,
    });
  },

  async findByPhoneAndRole(phone, role) {
    const filters = [{ column: 'phone', value: phone }];
    if (role) filters.push({ column: 'role', value: role });
    return dbAdapter.select('users', {
      filters,
      single: true,
    });
  },

  async findById(userId) {
    return dbAdapter.select('users', {
      filters: [{ column: 'id', value: userId }],
      single: true,
    });
  },

  async updatePinByUserId(userId, pinHash) {
    return dbAdapter.update(
      'users',
      { pin_hash: pinHash, updated_at: new Date().toISOString() },
      [{ column: 'id', value: userId }]
    );
  },

  async setActive(userId, active) {
    return dbAdapter.update(
      'users',
      { active, updated_at: new Date().toISOString() },
      [{ column: 'id', value: userId }]
    );
  },
};
