import { logRetentionRepository } from '../repositories/logRetentionRepository';

export const logRetentionService = {
  /**
   * Manager/owner maintenance: purge aged operational logs.
   * @param {object} args
   * @param {object} args.managerUser
   * @param {number} [args.auditDays=90]
   * @param {number} [args.notificationDays=30]
   * @param {number} [args.closedSessionDays=180]
   */
  async purgeOldLogs({
    managerUser,
    auditDays = 90,
    notificationDays = 30,
    closedSessionDays = 180,
  }) {
    try {
      if (!managerUser?.id) throw new Error('Manager session required.');
      return logRetentionRepository.purge({ auditDays, notificationDays, closedSessionDays });
    } catch (err) {
      throw err;
    }
  },
};
