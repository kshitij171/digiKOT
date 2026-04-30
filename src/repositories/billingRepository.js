import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const billingRepository = {
  async createBill(payload) {
    const billId = createId();
    await dbAdapter.insert('bills', {
      id: billId,
      ...payload,
      created_at: new Date().toISOString(),
    });
    return billId;
  },

  async createBillItems(items) {
    if (!items.length) return;
    await dbAdapter.insert('bill_items', items.map((item) => ({ id: createId(), ...item })));
  },
};
