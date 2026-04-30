import { billingRepository } from '../repositories/billingRepository';
import { tableSessionRepository } from '../repositories/tableSessionRepository';
import { auditService } from './auditService';

export const billingService = {
  async createBillForTable({
    tableNumber,
    waiterUserId,
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
      subtotal,
      service_charge: serviceCharge,
      tax,
      total,
      printed: true,
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
      after_json: { tableNumber, total },
    });
    return billId;
  },
};
