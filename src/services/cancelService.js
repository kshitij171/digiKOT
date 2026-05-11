import { cancelRepository } from '../repositories/cancelRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { kotRepository } from '../repositories/kotRepository';
import { userRepository } from '../repositories/userRepository';
import { kotActionsRepository } from '../repositories/kotActionsRepository';
import { notificationService } from './notificationService';
import { auditService } from './auditService';
import { createSubscriptionController } from './subscriptionController';

export const cancelService = {
  async listByTable(tableNumber) {
    return cancelRepository.listByTable(tableNumber);
  },

  subscribeByTable(tableNumber, onData) {
    const load = async () => {
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

  subscribePending(onData) {
    const load = async () => {
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

  async requestCancel({ tableNumber, itemId, itemName, qty, originalKotId, waiterUserId, reason }) {
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
  },

  async reviewCancel({ request, reviewerUserId, approve, supervisorId, supervisorName }) {
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

    // Log to kot_actions for full auditability
    await kotActionsRepository.logAction({
      kotId: request.originalKotId,
      action: approve ? 'cancel_approved' : 'cancel_rejected',
      performedByWaiterId: reviewerUserId,
    }).catch(() => {});

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
  },
};
