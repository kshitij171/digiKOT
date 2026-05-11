import { dbAdapter } from '../lib/db/dbAdapter';
import { supabase } from '../lib/db/supabaseClient';

export const userRepository = {
  async findByPinHash(pinHash) {
    return dbAdapter.select('users', {
      filters: [
        { column: 'pin_hash', value: pinHash },
        { column: 'active', value: true },
        { column: 'deleted_at', operator: 'is', value: null },
      ],
      single: true,
    });
  },

  async findByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    return dbAdapter.select('users', {
      filters: [
        { column: 'username', operator: 'ilike', value: normalized },
        { column: 'deleted_at', operator: 'is', value: null },
      ],
      single: true,
    });
  },

  async findActivePinHash(pinHash) {
    return dbAdapter.select('users', {
      filters: [
        { column: 'pin_hash', value: pinHash },
        { column: 'active', value: true },
        { column: 'deleted_at', operator: 'is', value: null },
      ],
      single: true,
    });
  },

  async createUser(payload) {
    return dbAdapter.insert('users', payload);
  },

  async listUsers() {
    // Only return non-deleted users; historical attribution (waiter_username snapshots) is preserved
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async findByPhoneAndRole(phone, role) {
    const filters = [
      { column: 'phone', value: phone },
      { column: 'deleted_at', operator: 'is', value: null },
    ];
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

  /**
   * Admin-level username lookup — does NOT filter by deleted_at.
   * Used for manager operations (PIN reset) so they work regardless of whether
   * the staff member is soft-deleted or whether the deleted_at column exists yet.
   */
  async findByUsernameAdmin(username) {
    const normalized = String(username || '').trim().toLowerCase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', normalized)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async updatePinByUserId(userId, pinHash) {
    const updatedAt = new Date().toISOString();
    // Reinstate active=true and deleted_at=null so a manager PIN-reset also
    // unblocks a previously soft-deleted account.
    console.log(
      `[userRepository] PIN update query: UPDATE users SET pin_hash='[REDACTED]', active=true, deleted_at=null, updated_at='${updatedAt}' WHERE id='${userId}'`
    );
    const { data, error } = await supabase
      .from('users')
      .update({ pin_hash: pinHash, active: true, deleted_at: null, updated_at: updatedAt })
      .eq('id', userId)
      .select('id, username, active, deleted_at');
    if (error) throw error;
    const rowsAffected = Array.isArray(data) ? data.length : 0;
    const updated = data?.[0] ?? null;
    console.log(
      `[userRepository] PIN update result: rows affected=${rowsAffected}, username=${updated?.username}, active=${updated?.active}, deleted_at=${updated?.deleted_at}, userId=${userId}`
    );
    return { rowsAffected, updatedUsername: updated?.username ?? null };
  },

  /**
   * Returns true if a staff code is already taken by ANY row —
   * including inactive and soft-deleted users. The UNIQUE (code) constraint
   * covers all rows, so code generation must check the same scope.
   */
  async codeExists(code) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  },

  /**
   * Returns every pin_hash in the users table with NO filters —
   * includes inactive and soft-deleted records. Used to guarantee that
   * suggested PINs don't collide with any existing PIN, past or present.
   */
  async listAllPinHashes() {
    const { data, error } = await supabase
      .from('users')
      .select('pin_hash');
    if (error) throw error;
    return (data || []).map((r) => r.pin_hash).filter(Boolean);
  },

  async softDelete(userId) {
    const now = new Date().toISOString();
    return dbAdapter.update(
      'users',
      { deleted_at: now, active: false, updated_at: now },
      [{ column: 'id', value: userId }]
    );
  },
};
