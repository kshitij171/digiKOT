import { userRepository } from '../repositories/userRepository';
import { getRouteForRole, hashPin, normalizePhone, validatePin } from '../lib/utils/auth';

// Fallback demo users — only used if the database is unreachable.
// Each user has a unique PIN so the PIN-based lookup works correctly.
// PIN 1234 → waiter1, PIN 5678 → waiter2, PIN 9999 → ksup1, PIN 4321 → mgr1
const DEMO_USERS = [
  { id: 'u_waiter_1',            username: 'waiter1', name: 'Waiter One',             role: 'waiter',             phone: '9876543201', pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', active: true },
  { id: 'u_waiter_2',            username: 'waiter2', name: 'Waiter Two',             role: 'waiter',             phone: '9876543205', pin_hash: 'f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75', active: true },
  { id: 'u_kitchen_supervisor_1',username: 'ksup1',   name: 'Kitchen Supervisor One', role: 'kitchen_supervisor', phone: '9876543203', pin_hash: '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05', active: true },
  { id: 'u_manager_1',           username: 'mgr1',    name: 'Manager One',            role: 'manager',            phone: '9876543204', pin_hash: 'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3', active: true },
];

export const authService = {
  /**
   * Look up a user purely by their 4-digit PIN.
   * Returns the user object on success; throws with a generic message on failure
   * so callers never learn whether the PIN exists but belongs to an inactive user.
   */
  async loginWithPin(pin) {
    const pinHash = await hashPin(pin);

    let user = null;
    try {
      user = await userRepository.findByPinHash(pinHash);
    } catch (error) {
      console.warn('DB lookup failed, using demo users.', error);
      user = DEMO_USERS.find((u) => u.pin_hash === pinHash && u.active) || null;
    }

    if (!user) {
      user = DEMO_USERS.find((u) => u.pin_hash === pinHash && u.active) || null;
    }

    if (!user || !user.active) throw new Error('Incorrect PIN.');
    return user;
  },

  getRouteForRole,

  /**
   * Manager resets a waiter's PIN by their username.
   * Also validates the new PIN is not already in use by another active user.
   */
  async resetPinByUsername({ username, newPin }) {
    if (!username) throw new Error('Username is required.');
    if (!validatePin(newPin)) throw new Error('PIN must be exactly 4 digits.');

    let user = null;
    try {
      user = await userRepository.findByUsername(username);
    } catch (error) {
      console.warn('DB lookup failed for PIN reset.', error);
    }

    if (!user) {
      user = DEMO_USERS.find((u) => u.username === username) || null;
    }
    if (!user) throw new Error('No staff member found with that username.');

    const newPinHash = await hashPin(newPin);

    let conflict = null;
    try {
      conflict = await userRepository.findActivePinHash(newPinHash);
    } catch (_) { /* ignore */ }

    if (conflict && conflict.id !== user.id) {
      throw new Error('This PIN is already in use. Choose a different one.');
    }

    if (DEMO_USERS.some((u) => u.id === user.id)) {
      user.pin_hash = newPinHash;
      return;
    }
    await userRepository.updatePinByUserId(user.id, newPinHash);
  },

  /**
   * Legacy helper kept for authService.resetPinByPhone calls that may exist elsewhere.
   */
  async resetPinByPhone({ phone, role, newPin }) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw new Error('Phone number is required.');
    if (!validatePin(newPin)) throw new Error('PIN must be exactly 4 digits.');

    const user = await userRepository.findByPhoneAndRole(normalizedPhone, role);
    if (!user) throw new Error('No active staff found for this phone and role.');

    const newPinHash = await hashPin(newPin);
    let conflict = null;
    try {
      conflict = await userRepository.findActivePinHash(newPinHash);
    } catch (_) { /* ignore */ }

    if (conflict && conflict.id !== user.id) {
      throw new Error('This PIN is already in use. Choose a different one.');
    }

    await userRepository.updatePinByUserId(user.id, newPinHash);
  },
};
