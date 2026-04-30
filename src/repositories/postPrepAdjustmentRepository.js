import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const postPrepAdjustmentRepository = {
  async create(payload) {
    return dbAdapter.insert('postprep_adjustments', {
      id: createId(),
      ...payload,
      created_at: new Date().toISOString(),
    });
  },
};
