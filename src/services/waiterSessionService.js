import { waiterSessionRepository } from '../repositories/waiterSessionRepository';
import { createId } from '../lib/utils/id';

export const waiterSessionService = {
  async openSession(waiterId, deviceIdentifier) {
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
  },

  async closeSession(sessionId) {
    if (!sessionId) return;
    try {
      await waiterSessionRepository.closeSession(sessionId, new Date().toISOString());
    } catch (err) {
      console.warn('Could not record waiter session end:', err);
    }
  },
};
