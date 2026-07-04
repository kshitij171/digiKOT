import { cancelRepository } from '../repositories/cancelRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { kotRepository } from '../repositories/kotRepository';
import { userRepository } from '../repositories/userRepository';
import { notificationService } from './notificationService';
import { auditService } from './auditService';
import { createSubscriptionController } from './subscriptionController';

function userDisplayLabel(user) {
  if (!user) return '—';
  if (user.name && String(user.name).trim()) return user.name.trim();
  if (user.username) return `@${user.username}`;
  return '—';
}

export const cancelService = {
  /**
   * Lists cancellation requests for a table (newest first).
   * @param {number} tableNumber
   * @returns {Promise<Array<object>>}
   */
  async listByTable(tableNumber) {
    try {
      return cancelRepository.listByTable(tableNumber);
    } catch (err) {
      throw err;
    }
  },

  /**
   * One-time load for manager Cancelled KOTs tab (no realtime).
   * Hydrates waiter/supervisor display labels for the UI.
   * @param {number} [limit=500]
   * @returns {Promise<Array<object>>}
   */
  async listAllCancellationRequests(limit = 500) {
    try {
      const rows = await cancelRepository.listAll(limit);
      const userIds = new Set();
      for (const r of rows || []) {
        if (r.waiter_user_id) userIds.add(r.waiter_user_id);
        if (r.reviewed_by_user_id) userIds.add(r.reviewed_by_user_id);
      }
      const users = await Promise.all(
        [...userIds].map((id) => userRepository.findById(id).catch(() => null))
      );
      const byId = {};
      users.forEach((u) => {
        if (u?.id) byId[u.id] = u;
      });

      return (rows || []).map((r) => ({
        id: r.id,
        tableNumber: r.table_number,
        itemName: r.item_name,
        qty: r.qty,
        originalKotId: r.kot_id,
        status: r.status,
        reason: r.reason || '',
        requestedAt: r.requested_at,
        reviewedAt: r.reviewed_at,
        waiterLabel: userDisplayLabel(byId[r.waiter_user_id]),
        supervisorLabel: userDisplayLabel(byId[r.reviewed_by_user_id]),
      }));
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to cancellation requests for a table and emits UI-shaped rows.
   * @param {number} tableNumber
   * @param {(rows: Array<object>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeByTable(tableNumber, onData) {
    const load = async () => {
      try {
        const rows = await this.listByTable(tableNumber);
        onData(
          rows.map((r) => ({
            id: r.id,
            tableNumber: r.table_number,
            itemId: r.kot_item_id,
            itemName: r.item_name,
            qty: r.qty,
            originalKotId: r.kot_id,
            status: r.status,
            reason: r.reason || '',
          }))
        );
      } catch (err) {
        throw err;
      }
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: `cancel-reqs-${tableNumber}`,
            table: 'cancel_requests',
            filter: `table_number=eq.${tableNumber}`,
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  /**
   * Subscribes to pending cancellation requests (manager view).
   * @param {(rows: Array<object>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribePending(onData) {
    const load = async () => {
      try {
        const rows = await cancelRepository.listPending();
        onData(
          rows.map((r) => ({
            id: r.id,
            tableNumber: r.table_number,
            itemId: r.kot_item_id,
            itemName: r.item_name,
            qty: r.qty,
            originalKotId: r.kot_id,
            status: r.status,
            waiterUserId: r.waiter_user_id,
            reason: r.reason || '',
          }))
        );
      } catch (err) {
        throw err;
      }
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: 'pending-cancel-reqs',
            table: 'cancel_requests',
            filter: 'status=eq.pending_approval',
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  /**
   * Creates a pending cancellation request (waiter action).
   * Does not modify kot_items directly.
   * @param {object} args
   * @param {number} args.tableNumber
   * @param {string} args.itemId
   * @param {string} args.itemName
   * @param {number} args.qty
   * @param {string} args.originalKotId
   * @param {string} args.waiterUserId
   * @param {string} args.reason
   * @returns {Promise<void>}
   */
  async requestCancel({ tableNumber, itemId, itemName, qty, originalKotId, waiterUserId, reason }) {
    try {
      await cancelRepository.create({
        table_number: tableNumber,
        kot_item_id: itemId,
        item_name: itemName,
        qty,
        kot_id: originalKotId,
        waiter_user_id: waiterUserId,
        reason,
      });
      await auditService.log({
        actor_user_id: waiterUserId,
        action: 'request_cancel',
        entity_type: 'kot_item',
        entity_id: `${originalKotId}:${itemId}`,
        remarks: reason,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Reviews a cancellation request (approve/reject) and applies side effects.
   * @param {object} args
   * @param {object} args.request - UI-shaped request object.
   * @param {string} args.reviewerUserId
   * @param {boolean} args.approve
   * @param {string|null} [args.supervisorId]
   * @param {string|null} [args.supervisorName]
   * @returns {Promise<void>}
   */
  async reviewCancel({ request, reviewerUserId, approve, supervisorId, supervisorName }) {
    try {
      // First-touch ownership: tag the KOT before any other update
      if (supervisorId && request.originalKotId) {
        const kot = await kotRepository.getById(request.originalKotId).catch(() => null);
        if (kot && !kot.supervisor_id) {
          await kotRepository.assignSupervisor(request.originalKotId, supervisorId, supervisorName || null).catch((e) =>
            console.warn('assignSupervisor failed:', e)
          );
        }
      }

      await cancelRepository.updateStatus(request.id, approve ? 'approved' : 'rejected', reviewerUserId);
      if (approve) {
        await kotRepository.updateItemStatus(request.originalKotId, request.itemId, 'cancelled');
        if (request.waiterUserId) {
          await notificationService.createNotification({
            target_user_id: request.waiterUserId,
            table_number: request.tableNumber,
            event_type: 'cancel_approved',
            payload_json: { itemName: request.itemName, kotId: request.originalKotId },
          });
        }
      } else {
        // Rejection: item remains in its active state. Notify the waiter.
        if (request.waiterUserId) {
          await notificationService.createNotification({
            target_user_id: request.waiterUserId,
            table_number: request.tableNumber,
            event_type: 'cancel_rejected',
            payload_json: { itemName: request.itemName, kotId: request.originalKotId },
          });
        }
      }

      let waiterUsername = null;
      if (request.waiterUserId) {
        const w = await userRepository.findById(request.waiterUserId).catch(() => null);
        waiterUsername = w?.username || null;
      }

      await auditService.log({
        actor_user_id: reviewerUserId,
        action: approve ? 'approve_cancel' : 'reject_cancel',
        entity_type: 'cancel_request',
        entity_id: request.id,
        after_json: {
          kotId: request.originalKotId,
          tableNumber: request.tableNumber,
          waiterUserId: request.waiterUserId || null,
          waiterUsername,
          itemName: request.itemName,
          qty: request.qty,
          decision: approve ? 'approved' : 'rejected',
        },
      });
    } catch (err) {
      throw err;
    }
  },
};
