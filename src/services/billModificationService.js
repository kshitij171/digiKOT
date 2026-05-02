import { billModificationRepository } from '../repositories/billModificationRepository';
import { billingRepository } from '../repositories/billingRepository';
import { auditService } from './auditService';
import { notificationService } from './notificationService';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

export const billModificationService = {
  async requestItemRemoval({ billId, waiterId, waiterUsername, tableNumber, itemsToRemove, reason }) {
    if (!billId) throw new Error('Bill ID is required.');
    if (!itemsToRemove || itemsToRemove.length === 0) throw new Error('Select at least one item to remove.');
    if (!reason || !String(reason).trim()) throw new Error('A reason is required.');

    await billModificationRepository.createRequest({
      billId,
      waiterId,
      waiterUsername,
      tableNumber: tableNumber || null,
      itemsToRemove,
      reason: String(reason).trim(),
    });

    await auditService.log({
      actor_user_id: waiterId,
      action: 'BILL_MODIFICATION_REQUESTED',
      entity_type: 'bill',
      entity_id: billId,
      remarks: reason,
      after_json: { itemsToRemove, waiterUsername, tableNumber },
    });
  },

  async listPendingRequests() {
    return billModificationRepository.listPending();
  },

  async listAllRequests(limit = 100) {
    return billModificationRepository.listAll(limit);
  },

  async approveRequest(requestId, managerUserId) {
    const req = await billModificationRepository.getById(requestId);
    if (!req) throw new Error('Request not found.');
    if (req.status !== 'pending') throw new Error('This request has already been actioned.');

    const bill = await billingRepository.getBillById(req.bill_id);
    if (!bill) throw new Error('Bill not found.');

    const billItems = await billingRepository.getBillItems(req.bill_id);
    const itemsToRemove = Array.isArray(req.items_to_remove) ? req.items_to_remove : [];

    // Exclude matching bill_items (matched by item_name)
    for (const itemToRemove of itemsToRemove) {
      const matches = billItems.filter(
        (bi) => bi.item_name === itemToRemove.itemName && bi.include_in_bill !== false
      );
      for (const bi of matches) {
        await billingRepository.excludeBillItem(bi.id);
      }
    }

    // Recalculate totals proportionally from remaining included items
    const updatedItems = await billingRepository.getBillItems(req.bill_id);
    const included = updatedItems.filter((bi) => bi.include_in_bill !== false);
    const newSubtotal = included.reduce((sum, bi) => sum + Number(bi.line_total), 0);
    const ratio = Number(bill.subtotal) > 0 ? newSubtotal / Number(bill.subtotal) : 0;
    const newServiceCharge = Math.round(Number(bill.service_charge) * ratio * 100) / 100;
    const newTax = Math.round(Number(bill.tax) * ratio * 100) / 100;
    const newTotal = Math.round((newSubtotal + newServiceCharge + newTax) * 100) / 100;

    await billingRepository.updateBillTotals(req.bill_id, {
      subtotal: newSubtotal,
      service_charge: newServiceCharge,
      tax: newTax,
      total: newTotal,
    });

    await billModificationRepository.updateStatus(requestId, 'approved', managerUserId, null);

    if (req.waiter_id) {
      await notificationService.createNotification({
        target_user_id: req.waiter_id,
        table_number: req.table_number,
        session_id: null,
        event_type: 'bill_modification_approved',
        payload_json: { billId: req.bill_id, requestId, newTotal },
      }).catch(() => {});
    }

    await auditService.log({
      actor_user_id: managerUserId,
      action: 'BILL_MODIFICATION_APPROVED',
      entity_type: 'bill_modification_request',
      entity_id: requestId,
      after_json: { billId: req.bill_id, newTotal, itemsRemoved: itemsToRemove.length },
    });
  },

  async rejectRequest(requestId, managerUserId, rejectionReason) {
    const req = await billModificationRepository.getById(requestId);
    if (!req) throw new Error('Request not found.');
    if (req.status !== 'pending') throw new Error('This request has already been actioned.');

    await billModificationRepository.updateStatus(
      requestId,
      'rejected',
      managerUserId,
      rejectionReason || null
    );

    if (req.waiter_id) {
      await notificationService.createNotification({
        target_user_id: req.waiter_id,
        table_number: req.table_number,
        session_id: null,
        event_type: 'bill_modification_rejected',
        payload_json: { billId: req.bill_id, requestId, rejectionReason: rejectionReason || null },
      }).catch(() => {});
    }

    await auditService.log({
      actor_user_id: managerUserId,
      action: 'BILL_MODIFICATION_REJECTED',
      entity_type: 'bill_modification_request',
      entity_id: requestId,
      remarks: rejectionReason || null,
    });
  },

  subscribeRequests(onData) {
    const load = async () => {
      const reqs = await billModificationRepository.listAll(200);
      onData(reqs || []);
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: 'bill-mod-requests',
            table: 'bill_modification_requests',
            onEvent,
            onStatus,
          }),
      ],
    });
  },
};
