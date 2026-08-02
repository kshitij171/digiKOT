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
  /**
   * Creates a bill modification request for manager approval (printed bill removal flow).
   * @param {object} args
   * @param {string} args.billId
   * @param {string|null} args.waiterId
   * @param {string|null} args.waiterUsername
   * @param {number|null} args.tableNumber
   * @param {Array<object>} args.itemsToRemove
   * @param {string} args.reason
   * @returns {Promise<void>}
   */
  async requestItemRemoval({ billId, waiterId, waiterUsername, tableNumber, itemsToRemove, reason }) {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists pending modification requests.
   * @returns {Promise<Array<object>>}
   */
  async listPendingRequests() {
    try {
      return billModificationRepository.listPending();
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists modification requests (most recent first).
   * @param {number} [limit=100]
   * @returns {Promise<Array<object>>}
   */
  async listAllRequests(limit = 100) {
    try {
      return billModificationRepository.listAll(limit);
    } catch (err) {
      throw err;
    }
  },

  /** Waiter summary: approved removals for attribution lines */
  /**
   * Lists approved removal requests for a table (waiter summary annotations).
   * @param {number|string} tableNumber
   * @returns {Promise<Array<object>>}
   */
  async listApprovedForTable(tableNumber) {
    try {
      if (tableNumber == null || Number.isNaN(Number(tableNumber))) return [];
      return billModificationRepository.listApprovedForTable(Number(tableNumber));
    } catch (err) {
      throw err;
    }
  },

  /**
   * Manager approval flow:
   * 1) Validate request + target rows still exist
   * 2) Apply KOT item qty/status
   * 3) Mark request approved
   * 4) Void stale bill + notify + audit
   */
  async approveRequest(requestId, managerUserId, options = {}) {
    try {
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

      const itemsToRemove = Array.isArray(req.items_to_remove) ? req.items_to_remove : [];
      const billItems = await billingRepository.getBillItems(req.bill_id);
      const bill = await billingRepository.getBillById(req.bill_id);

      if (bill?.cleared_at) {
        throw new Error(
          'This request can no longer be approved because the table was already cleared. Ask the waiter to raise a new request before clearing.'
        );
      }

      const updates = [];

      // ── STEP 1 — Validate and collect item mutations ──
      for (const itemToRemove of itemsToRemove) {
        const billItem = findBillLineForRemoval(billItems, itemToRemove);
        if (!billItem?.kot_item_id) {
          throw new Error('Could not match one or more removal items to the current bill lines.');
        }
        const colonIdx = billItem.kot_item_id.indexOf(':');
        if (colonIdx === -1) {
          throw new Error('Invalid bill line mapping found while approving removal.');
        }
        const kotId = billItem.kot_item_id.slice(0, colonIdx);
        const menuItemId = billItem.kot_item_id.slice(colonIdx + 1);
        const removalQty = Number(itemToRemove.qty);
        if (!Number.isFinite(removalQty) || removalQty <= 0) {
          throw new Error('Invalid removal quantity in request.');
        }
        updates.push({ kotId, menuItemId, removalQty });
      }

      // ── STEP 2 — Apply kot_items updates ──
      for (const update of updates) {
        await kotRepository.applyPartialRemoval(update.kotId, update.menuItemId, update.removalQty);
        await kotRepository.getByIdWithItems(update.kotId);
      }

      // ── STEP 3 — Persist approval metadata after successful updates ──
      await billModificationRepository.markApproved(
        requestId,
        managerUserId,
        approvedByDisplayName,
        approvalNote
      );

      // ── STEP 4 — Void stale bill (do not delete) ──
      if (bill && !bill.voided_at) {
        await billingRepository.voidBill(req.bill_id, {
          voidedBy: managerUserId,
          voidReason: 'manager_approved_removal',
        });
      }

      // ── STEP 5 — Notify waiter ──
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
    } catch (err) {
      if (/kot_item not found/i.test(String(err?.message || ''))) {
        throw new Error(
          'This request can no longer be approved because the original KOT item is no longer available (likely after table clear).'
        );
      }
      throw err;
    }
  },

  /**
   * Rejects a modification request and notifies the waiter.
   * @param {string} requestId
   * @param {string} managerUserId
   * @param {string} rejectionReason
   * @returns {Promise<void>}
   */
  async rejectRequest(requestId, managerUserId, rejectionReason) {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to removal requests for a specific table + waiter (waiter summary view).
   * @param {number} tableNumber
   * @param {string|null} waiterUserId
   * @param {(rows: Array<object>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeRemovalRequestsForWaiterTable(tableNumber, waiterUserId, onData) {
    const load = async () => {
      try {
        if (waiterUserId == null) {
          onData([]);
          return;
        }
        const rows = await billModificationRepository.listRecentForTableWaiter(tableNumber, waiterUserId, 40);
        onData(rows || []);
      } catch (err) {
        throw err;
      }
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

  /**
   * Subscribes to modification requests for a manager:
   * all pending (any waiter) + only this manager's approved/rejected history.
   * @param {string} managerUserId
   * @param {(rows: Array<object>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeRequests(managerUserId, onData) {
    const load = async () => {
      try {
        const reqs = await billModificationRepository.listForManager(managerUserId, 200);
        onData(reqs || []);
      } catch (err) {
        throw err;
      }
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: `bill-mod-requests-mgr-${managerUserId || 'anon'}`,
            table: 'bill_modification_requests',
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  /**
   * Pending count for tab badge (shared queue — all managers see the same total).
   * @param {(count: number) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribePendingCount(onData) {
    const load = async () => {
      try {
        const rows = await billModificationRepository.listPending();
        onData((rows || []).length);
      } catch (err) {
        throw err;
      }
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: 'bill-mod-pending-count',
            table: 'bill_modification_requests',
            filter: `status=eq.${BillModRequestStatus.PENDING}`,
            onEvent,
            onStatus,
          }),
      ],
    });
  },
};
