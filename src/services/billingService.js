import { billingRepository } from '../repositories/billingRepository';
import { tableSessionRepository } from '../repositories/tableSessionRepository';
import { auditService } from './auditService';

export const billingService = {
  async createBillForTable({
    tableNumber,
    waiterUserId,
    waiterUsername,
    clearedKots,
    subtotal,
    serviceCharge,
    tax,
    total,
  }) {
    const session = await tableSessionRepository.getActiveByTable(tableNumber);
    const billId = await billingRepository.createBill({
      session_id: session?.id || null,
      table_number: tableNumber,
      waiter_user_id: waiterUserId || null,
      waiter_username: waiterUsername || null,
      subtotal,
      service_charge: serviceCharge,
      tax,
      total,
      printed: true,
      bill_status: 'printed',
    });
    await billingRepository.createBillItems(
      clearedKots.flatMap((kot) =>
        (kot.items || []).map((item) => ({
          bill_id: billId,
          kot_item_id: `${kot._docId}:${item.itemId}`,
          item_name: item.name,
          qty: item.qty,
          unit_price: item.price,
          line_total: item.price * item.qty,
          include_in_bill: item.status === 'done',
          exclusion_reason: item.status === 'done' ? null : item.status,
        }))
      )
    );
    await auditService.log({
      actor_user_id: waiterUserId,
      action: 'create_bill',
      entity_type: 'bill',
      entity_id: billId,
      after_json: { tableNumber, total, waiterUsername: waiterUsername || null },
    });
    return billId;
  },

  async listRecent(limit = 30) {
    return billingRepository.listRecent(limit);
  },

  // ── Audit lifecycle ───────────────────────────────────────
  async voidBill({ billId, managerUserId, reason }) {
    if (!billId) throw new Error('Bill ID is required.');
    if (!reason || !String(reason).trim()) throw new Error('A void reason is required.');
    await billingRepository.voidBill(billId, { voidedBy: managerUserId, voidReason: String(reason).trim() });
    await auditService.log({
      actor_user_id: managerUserId,
      action: 'VOID_BILL',
      entity_type: 'bill',
      entity_id: billId,
      remarks: reason,
    });
  },

  async resettleBill({ billId, managerUserId, originalPayment, newPayment }) {
    if (!billId) throw new Error('Bill ID is required.');
    await billingRepository.resettleBill(billId, {
      resettledBy: managerUserId,
      originalPayment: originalPayment || null,
      newPayment: newPayment || null,
    });
    await auditService.log({
      actor_user_id: managerUserId,
      action: 'RESETTLE_BILL',
      entity_type: 'bill',
      entity_id: billId,
      after_json: { originalPayment, newPayment },
    });
  },

  async applyDiscount({ billId, discountPercent, managerUserId }) {
    if (!billId) throw new Error('Bill ID is required.');
    const pct = Number(discountPercent);
    if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('Discount must be between 0 and 100.');

    const bill = await billingRepository.getBillById(billId);
    if (!bill) throw new Error('Bill not found.');
    const newTotal = Math.round(Number(bill.total) * (1 - pct / 100) * 100) / 100;

    await billingRepository.applyDiscount(billId, {
      discountPercent: pct,
      appliedBy: managerUserId,
      newTotal,
    });
    await auditService.log({
      actor_user_id: managerUserId,
      action: 'APPLY_DISCOUNT',
      entity_type: 'bill',
      entity_id: billId,
      after_json: { discountPercent: pct, newTotal },
    });
    return newTotal;
  },

  // ── Audit list queries ────────────────────────────────────
  async listVoidBills({ fromDate, toDate } = {}) {
    return billingRepository.listVoidBills({ fromDate, toDate });
  },

  async listResettledBills({ fromDate, toDate } = {}) {
    return billingRepository.listResettledBills({ fromDate, toDate });
  },

  async listHighDiscountBills({ fromDate, toDate, threshold = 50 } = {}) {
    return billingRepository.listHighDiscountBills({ fromDate, toDate, threshold });
  },
};
