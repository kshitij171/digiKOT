import { userRepository } from '../repositories/userRepository';
import { apiClient } from '../lib/api/apiClient';
import { getRouteForRole, normalizePhone } from '../lib/utils/auth';

export const authService = {
  /**
   * Looks up a user by PIN hash via the API (sets the session cookie).
   * Returns the user object on success; throws with a generic message on failure.
   * @param {string} pinHash - Hashed PIN from the component boundary.
   * @returns {Promise<object>} User row.
   */
  async loginWithPinHash(pinHash) {
    if (!pinHash) throw new Error('PIN must be exactly 4 digits.');

    let user = null;
    try {
      const res = await apiClient.login(pinHash);
      user = res?.user || null;
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        throw new Error(
          'Cannot reach the server. On this PC run npm run dev:all, then open http://<this-pc-lan-ip>:5173 on the other device (same Wi‑Fi).'
        );
      }
      if (message.includes('Invalid PIN') || message.includes('401')) {
        throw new Error('Incorrect PIN.');
      }
      if (message.includes('pinHash required')) {
        throw new Error('Login failed. Refresh the page and try again.');
      }
      throw new Error(message || 'Incorrect PIN.');
    }

    if (!user) throw new Error('Incorrect PIN.');
    if (user.active === false || user.active === 0) throw new Error('Incorrect PIN.');
    return user;
  },

  getRouteForRole,

  /**
   * Manager resets a waiter's PIN by their username.
   * Also validates the new PIN is not already in use by another active user.
   * @param {object} args
   * @param {string} args.username
   * @param {string} args.newPinHash - Hashed new PIN.
   * @returns {Promise<void>}
   */
  async resetPinByUsername({ username, newPinHash }) {
    try {
      if (!username) throw new Error('Username is required.');
      if (!newPinHash) throw new Error('PIN must be exactly 4 digits.');

      const normalizedUsername = String(username).trim().toLowerCase();

      const user = await userRepository.findByUsername(normalizedUsername);
      if (!user) throw new Error('No staff member found with that username.');

      const conflict = await userRepository.findActivePinHash(newPinHash).catch(() => null);
      if (conflict && conflict.id !== user.id) {
        throw new Error('This PIN is already in use. Choose a different one.');
      }

      const { rowsAffected } = await userRepository.updatePinByUserId(user.id, newPinHash);
      if (rowsAffected === 0) {
        throw new Error(
          `PIN update failed: no record was modified for username "${normalizedUsername}". Please try again or contact a manager.`
        );
      }
    } catch (err) {
      throw err;
    }
  },

  /**
   * Legacy helper kept for authService.resetPinByPhone calls that may exist elsewhere.
   * @param {object} args
   * @param {string} args.phone
   * @param {string} [args.role]
   * @param {string} args.newPinHash - Hashed new PIN.
   * @returns {Promise<void>}
   */
  async resetPinByPhone({ phone, role, newPinHash }) {
    try {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) throw new Error('Phone number is required.');
      if (!newPinHash) throw new Error('PIN must be exactly 4 digits.');

      const user = await userRepository.findByPhoneAndRole(normalizedPhone, role);
      if (!user) throw new Error('No active staff found for this phone and role.');
      let conflict = null;
      try {
        conflict = await userRepository.findActivePinHash(newPinHash);
      } catch (_) { /* ignore */ }

      if (conflict && conflict.id !== user.id) {
        throw new Error('This PIN is already in use. Choose a different one.');
      }

      await userRepository.updatePinByUserId(user.id, newPinHash);
    } catch (err) {
      throw err;
    }
  },
};
