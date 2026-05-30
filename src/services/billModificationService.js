import { billModificationRepository, BillModRequestStatus } from '../repositories/billModificationRepository';
import { billingRepository } from '../repositories/billingRepository';
import { kotRepository } from '../repositories/kotRepository';
import { userRepository } from '../repositories/userRepository';
import { auditService } from './auditService';
import { notificationService } from './notificationService';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

/** Locate printed bill line for a waiter removal row (KOT + menu item id). */
function findBillLineForRemoval(billItems, itemToRemove) {
  const wantId = itemToRemove.itemId;
  const wantKotId = itemToRemove.kotId;
  const wantName = itemToRemove.itemName ?? itemToRemove.name;

  if (wantKotId) {
    const byKot = billItems.find((bi) => {
      if (!bi.kot_item_id || typeof bi.kot_item_id !== 'string') return false;
      const colon = bi.kot_item_id.indexOf(':');
      if (colon < 0) return false;
      const kotId = bi.kot_item_id.slice(0, colon);
      const menuId = bi.kot_item_id.slice(colon + 1);
      return kotId === wantKotId && menuId === wantId;
    });
    if (byKot) return byKot;
  }

  return billItems.find((bi) => {
    if (!bi.kot_item_id || typeof bi.kot_item_id !== 'string') return false;
    const colon = bi.kot_item_id.indexOf(':');
    const menuId = colon >= 0 ? bi.kot_item_id.slice(colon + 1) : '';
    const nameOk = bi.item_name === wantName || (wantName && bi.item_name?.includes?.(wantName));
    return menuId === wantId && nameOk;
  });
}

function formatRemovalItemsSummary(itemsToRemove) {
  const list = Array.isArray(itemsToRemove) ? itemsToRemove : [];
  if (!list.length) return '—';
  return list
    .map((i) => {
      const name = i.itemName ?? i.name ?? 'Item';
      const q = Number(i.qty) || 0;
      return `${name} × ${q}`;
    })
    .join(', ');
}

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

  /** Waiter summary: approved removals for attribution lines */
  async listApprovedForTable(tableNumber) {
    if (tableNumber == null || Number.isNaN(Number(tableNumber))) return [];
    return billModificationRepository.listApprovedForTable(Number(tableNumber));
  },

  /**
   * Manager approval — strict order:
   * 1) Persist approval on request (await)
   * 2) Apply KOT item qty/status + verify read-after-write
   * 3) Void existing printed bill (preserve audit row)
   * 4) Notify + audit log
   */
  async approveRequest(requestId, managerUserId, options = {}) {
    const approvalNote = options.approvalNote != null && String(options.approvalNote).trim()
      ? String(options.approvalNote).trim()
      : null;

    const req = await billModificationRepository.getById(requestId);
    if (!req) throw new Error('Request not found.');
    if (req.status !== BillModRequestStatus.PENDING) {
      throw new Error('This request has already been actioned.');
    }

    let approvedByDisplayName = 'Manager';
    try {
      const manager = await userRepository.findById(managerUserId);
      if (manager) {
        approvedByDisplayName =
          (manager.name && String(manager.name).trim()) ||
          (manager.username ? `@${manager.username}` : '') ||
          approvedByDisplayName;
      }
    } catch {
      /* keep default */
    }

    // ── STEP 1 — Mark request approved (must complete before KOT updates) ──
    await billModificationRepository.markApproved(
      requestId,
      managerUserId,
      approvedByDisplayName,
      approvalNote
    );

    const itemsToRemove = Array.isArray(req.items_to_remove) ? req.items_to_remove : [];
    const billItems = await billingRepository.getBillItems(req.bill_id);

    // ── STEP 2 — Update kot_items (SQL rows, not JSON documents) ──
    for (const itemToRemove of itemsToRemove) {
      const billItem = findBillLineForRemoval(billItems, itemToRemove);
      if (!billItem?.kot_item_id) {
        console.warn('[approveRemoval] No bill line match — skipping item', itemToRemove);
        continue;
      }
      const colonIdx = billItem.kot_item_id.indexOf(':');
      if (colonIdx === -1) continue;
      const kotId = billItem.kot_item_id.slice(0, colonIdx);
      const menuItemId = billItem.kot_item_id.slice(colonIdx + 1);
      const removalQty = Number(itemToRemove.qty);
      if (!Number.isFinite(removalQty) || removalQty <= 0) continue;

      await kotRepository.applyPartialRemoval(kotId, menuItemId, removalQty);

      const kotAfter = await kotRepository.getByIdWithItems(kotId);
      const updatedItem = kotAfter?.items?.find((i) => i.menu_item_id === menuItemId);
      console.log('[approveRemoval] KOT persisted', {
        kotId,
        menuItemId,
        row: updatedItem
          ? {
              qty: updatedItem.qty,
              status: updatedItem.status,
              final_qty: updatedItem.final_qty,
              removed_qty: updatedItem.removed_qty,
            }
          : null,
      });
    }

    // ── STEP 3 — Void bill (do not delete): only issued bills ──
    const bill = await billingRepository.getBillById(req.bill_id);
    if (bill && !bill.cleared_at && !bill.voided_at) {
      await billingRepository.voidBill(req.bill_id, {
        voidedBy: managerUserId,
        voidReason: 'manager_approved_removal',
      });
      console.log(
        `[approveRemoval] Bill #${String(req.bill_id).slice(-6).toUpperCase()} voided due to removal approval`
      );
    }

    // ── STEP 4 — Notify waiter (realtime also updates kot_items subscription) ──
    if (req.waiter_id) {
      try {
        await notificationService.createNotification({
          target_user_id: req.waiter_id,
          table_number: req.table_number,
          session_id: null,
          event_type: 'bill_modification_approved',
          payload_json: {
            billId: req.bill_id,
            requestId,
            tableNumber: req.table_number,
            itemsRemoved: itemsToRemove.length,
          },
        });
      } catch (e) {
        console.warn('[approveRemoval] notification failed:', e?.message || e);
      }
    }

    await auditService.log({
      actor_user_id: managerUserId,
      action: 'BILL_MODIFICATION_APPROVED',
      entity_type: 'bill_modification_request',
      entity_id: requestId,
      after_json: {
        billId: req.bill_id,
        itemsRemoved: itemsToRemove.length,
        approvedByDisplayName,
      },
    });
  },

  async rejectRequest(requestId, managerUserId, rejectionReason) {
    const trimmed = String(rejectionReason ?? '').trim();
    if (!trimmed) {
      throw new Error('A rejection reason is required.');
    }

    const req = await billModificationRepository.getById(requestId);
    if (!req) throw new Error('Request not found.');
    if (req.status !== BillModRequestStatus.PENDING) throw new Error('This request has already been actioned.');

    let rejectedByDisplayName = 'Manager';
    try {
      const manager = await userRepository.findById(managerUserId);
      if (manager) {
        rejectedByDisplayName =
          (manager.name && String(manager.name).trim()) ||
          (manager.username ? `@${manager.username}` : '') ||
          rejectedByDisplayName;
      }
    } catch {
      /* keep default */
    }

    console.log('REJECTION PAYLOAD:', {
      requestId,
      reason: trimmed,
      rejectedBy: rejectedByDisplayName,
      rejectedById: managerUserId,
    });

    await billModificationRepository.markRejected(requestId, managerUserId, rejectedByDisplayName, trimmed);

    if (req.waiter_id) {
      try {
        await notificationService.createNotification({
          target_user_id: req.waiter_id,
          table_number: req.table_number,
          session_id: null,
          event_type: 'bill_modification_rejected',
          payload_json: {
            billId: req.bill_id,
            requestId,
            rejectionReason: trimmed,
            rejectedByDisplayName,
          },
        });
      } catch (e) {
        console.warn('[rejectRemoval] notification failed:', e?.message || e);
      }
    }

    const reviewedAtIso = new Date().toISOString();
    await auditService.log({
      actor_user_id: managerUserId,
      action: 'BILL_MODIFICATION_REJECTED',
      entity_type: 'bill_modification_request',
      entity_id: requestId,
      remarks: trimmed,
      after_json: {
        billId: req.bill_id,
        tableNumber: req.table_number,
        rejectionReason: trimmed,
        rejectedByDisplayName,
        rejectedById: managerUserId,
        reviewedAtIso,
        itemsToRemove: req.items_to_remove,
        itemsSummary: formatRemovalItemsSummary(req.items_to_remove),
      },
    });
  },

  subscribeRemovalRequestsForWaiterTable(tableNumber, waiterUserId, onData) {
    const load = async () => {
      if (waiterUserId == null) {
        onData([]);
        return;
      }
      const rows = await billModificationRepository.listRecentForTableWaiter(tableNumber, waiterUserId, 40);
      onData(rows || []);
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: `bill-mod-waiter-${tableNumber}`,
            table: 'bill_modification_requests',
            filter: `table_number=eq.${tableNumber}`,
            onEvent,
            onStatus,
          }),
      ],
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
