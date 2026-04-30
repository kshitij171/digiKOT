import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const auditRepository = {
  async create(payload) {
    return dbAdapter.insert('audit_logs', {
      id: createId(),
      ...payload,
      created_at: new Date().toISOString(),
    });
  },

  async listRecent(limit = 200) {
    return dbAdapter.select('audit_logs', {
      orderBy: 'created_at',
      ascending: false,
      limit,
    });
  },
};
