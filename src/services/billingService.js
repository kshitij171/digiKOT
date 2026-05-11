import { billingRepository } from '../repositories/billingRepository';
import { tableSessionRepository } from '../repositories/tableSessionRepository';
import { auditService } from './auditService';
import {
  computeBillTotalsFromClearedKots,
  applyDiscountPercent,
} from '../lib/billing/billTotals';

export const billingService = {
  async createBillForTable({
    tableNumber,
    waiterUserId,
    waiterUsername,
    clearedKots,
    serviceChargePct,
    taxPct,
    discountPercent = 0,
  }) {
    const session = await tableSessionRepository.getActiveByTable(tableNumber);

    const {
      subtotal,
      serviceChargeAmount,
      taxAmount,
      grandTotalBeforeDiscount,
    } = computeBillTotalsFromClearedKots(clearedKots, serviceChargePct, taxPct);

    const pct = Number(discountPercent) || 0;
    const { finalTotal } = applyDiscountPercent(grandTotalBeforeDiscount, pct);

    const billId = await billingRepository.createBill({
      session_id: session?.id || null,
      table_number: tableNumber,
      waiter_user_id: waiterUserId || null,
      waiter_username: waiterUsername || null,
      subtotal,
      service_charge: serviceChargeAmount,
      tax: taxAmount,
      total: finalTotal,
      discount_percent: pct > 0 ? pct : null,
      discount_applied_by: pct > 0 ? (waiterUserId || null) : null,
      discount_applied_at: pct > 0 ? new Date().toISOString() : null,
      printed: true,
      bill_status: 'printed',
    });
    await billingRepository.createBillItems(
      clearedKots.flatMap((kot) =>
        (kot.items || []).map((item) => {
          // For partially removed items, bill the effective (post-removal) quantity.
          // Fully removed items are excluded from the bill entirely.
          const isPartial = item.status === 'partially_removed';
          const isFullyRemoved = item.status === 'removed_entirely';
          const effectiveQty = isPartial ? (item.finalQty ?? 0) : item.qty;
          const includedInBill = item.status === 'done' || (isPartial && effectiveQty > 0);
          const lineName =
            item.itemName ??
            item.name ??
            item.item_name ??
            item.itemNameSnapshot ??
            'Unknown item';
          return {
            bill_id: billId,
            kot_item_id: `${kot._docId}:${item.itemId}`,
            item_name: lineName,
            qty: effectiveQty,
            unit_price: item.price,
            line_total: item.price * effectiveQty,
            include_in_bill: includedInBill,
            exclusion_reason: isFullyRemoved ? 'removed_entirely' : (!includedInBill ? item.status : null),
          };
        })
      )
    );
    await auditService.log({
      actor_user_id: waiterUserId,
      action: 'create_bill',
      entity_type: 'bill',
      entity_id: billId,
      after_json: { tableNumber, total: finalTotal, discountPercent: pct || null, waiterUsername: waiterUsername || null },
    });
    return billId;
  },

  async getBillById(billId) {
    return billingRepository.getBillById(billId);
  },

  async listRecent(limit = 30) {
    return billingRepository.listRecent(limit);
  },

  async listBills({ fromDate, toDate, search } = {}) {
    return billingRepository.listBills({ fromDate, toDate, search });
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
      after_json: {
        discountPercent: pct,
        newTotal,
        tableNumber: bill.table_number,
        waiterUsername: bill.waiter_username || null,
      },
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
