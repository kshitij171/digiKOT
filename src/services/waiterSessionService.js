import { waiterSessionRepository } from '../repositories/waiterSessionRepository';
import { createId } from '../lib/utils/id';

export const waiterSessionService = {
  /**
   * Opens a waiter session and returns the session id (best-effort persistence).
   * @param {string} waiterId - Waiter user id.
   * @param {string|null} deviceIdentifier - Optional device identifier/user-agent snippet.
   * @returns {Promise<string>} Session id.
   */
  async openSession(waiterId, deviceIdentifier) {
    try {
      const sessionId = createId();
      try {
        await waiterSessionRepository.create({
          id: sessionId,
          waiterId,
          loggedInAt: new Date().toISOString(),
          deviceIdentifier: deviceIdentifier || null,
        });
      } catch (err) {
        console.warn('Could not record waiter session start:', err);
      }
      return sessionId;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Closes a waiter session (best-effort persistence).
   * @param {string} sessionId - Session id.
   * @returns {Promise<void>}
   */
  async closeSession(sessionId) {
    try {
      if (!sessionId) return;
      try {
        await waiterSessionRepository.closeSession(sessionId, new Date().toISOString());
      } catch (err) {
        console.warn('Could not record waiter session end:', err);
      }
    } catch (err) {
      throw err;
    }
  },
};
