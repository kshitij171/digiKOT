import { userRepository } from '../repositories/userRepository';
import { getRouteForRole, hashPin, normalizePhone, validatePin } from '../lib/utils/auth';

const DEMO_USERS = [
  { id: 'u_waiter_1', code: 'W001', name: 'Waiter One', role: 'waiter', phone: '9876543201', pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', active: true },
  { id: 'u_captain_1', code: 'C001', name: 'Captain One', role: 'captain', phone: '9876543202', pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', active: true },
  { id: 'u_kitchen_supervisor_1', code: 'K001', name: 'Kitchen Supervisor One', role: 'kitchen_supervisor', phone: '9876543203', pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', active: true },
  { id: 'u_manager_1', code: 'M001', name: 'Manager One', role: 'manager', phone: '9876543204', pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', active: true },
];

export const authService = {
  async loginWithPin(code, pin, role) {
    let user = null;
    try {
      user = await userRepository.findByCodeAndRole(code, role);
    } catch (error) {
      console.warn('Using fallback demo users because DB lookup failed.', error);
    }

    if (!user && role === 'kitchen') {
      user = await userRepository.findByCodeAndRole(code, 'kitchen_supervisor');
    }

    if (!user) {
      user =
        DEMO_USERS.find((u) => {
          const normalizedRole = role === 'kitchen' ? 'kitchen_supervisor' : role;
          return u.code === code && u.role === normalizedRole;
        }) || null;
    }
    if (!user) throw new Error('User not found for selected role.');
    if (!user.active) throw new Error('This account is inactive. Please contact manager.');

    const pinHash = await hashPin(pin);
    const expectedPin = user.pin_hash || '';
    if (String(expectedPin) !== String(pinHash)) {
      throw new Error('Invalid PIN.');
    }
    return user;
  },

  getRouteForRole,

  async resetPinByPhone({ phone, role, newPin }) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw new Error('Phone number is required.');
    if (!validatePin(newPin)) throw new Error('PIN must be 4-6 digits.');

    let user = null;
    try {
      user = await userRepository.findByPhoneAndRole(normalizedPhone, role === 'kitchen' ? 'kitchen_supervisor' : role);
    } catch (error) {
      console.warn('Falling back to demo users for reset flow.', error);
    }
    if (!user) {
      user =
        DEMO_USERS.find((u) => {
          const normalizedRole = role === 'kitchen' ? 'kitchen_supervisor' : role;
          return normalizePhone(u.phone) === normalizedPhone && u.role === normalizedRole;
        }) || null;
    }
    if (!user) throw new Error('No active staff found for this phone and role.');

    const pinHash = await hashPin(newPin);
    if (user.id.startsWith('u_') && DEMO_USERS.some((u) => u.id === user.id)) {
      user.pin_hash = pinHash;
      return;
    }
    await userRepository.updatePinByUserId(user.id, pinHash);
  },
};
