import { dbAdapter } from '../lib/db/dbAdapter';
import { apiClient } from '../lib/api/apiClient';
import { createId } from '../lib/utils/id';

/** Only these values are valid for bill_modification_requests.status */
export const BillModRequestStatus = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const billModificationRepository = {
  /**
   * Creates a bill modification request row.
   * @param {object} args
   * @returns {Promise<any>}
   */
  async createRequest({ billId, waiterId, waiterUsername, tableNumber, itemsToRemove, reason }) {
    try {
      return dbAdapter.insert('bill_modification_requests', {
        id: createId(),
        bill_id: billId,
        waiter_id: waiterId || null,
        waiter_username: waiterUsername || null,
        waiter_name: waiterUsername || null,
        table_number: tableNumber || null,
        items_to_remove: itemsToRemove,
        reason,
        status: BillModRequestStatus.PENDING,
        requested_at: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Gets a modification request by id.
   * @param {string} requestId
   * @returns {Promise<object|null>}
   */
  async getById(requestId) {
    try {
      return dbAdapter.select('bill_modification_requests', {
        filters: [{ column: 'id', value: requestId }],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists pending requests (newest first).
   * @returns {Promise<Array<object>>}
   */
  async listPending() {
    try {
      return dbAdapter.select('bill_modification_requests', {
        filters: [{ column: 'status', value: BillModRequestStatus.PENDING }],
        orderBy: 'requested_at',
        ascending: false,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists requests (newest first).
   * @param {number} [limit=100]
   * @returns {Promise<Array<object>>}
   */
  async listAll(limit = 100) {
    try {
      return dbAdapter.select('bill_modification_requests', {
        orderBy: 'requested_at',
        ascending: false,
        limit,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Manager dashboard: all pending (shared queue) + approved/rejected only for this manager.
   * @param {string} managerUserId
   * @param {number} [limit=200]
   */
  async listForManager(managerUserId, limit = 200) {
    try {
      return apiClient.query('billMod.listForManager', { managerUserId, limit });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists approved requests for a bill.
   * @param {string} billId
   * @returns {Promise<Array<object>>}
   */
  async listApprovedForBill(billId) {
    try {
      return dbAdapter.select('bill_modification_requests', {
        filters: [
          { column: 'bill_id', value: billId },
          { column: 'status', value: BillModRequestStatus.APPROVED },
        ],
        orderBy: 'reviewed_at',
        ascending: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates request status and review metadata.
   * @param {string} requestId
   * @param {string} status
   * @param {string|null} reviewedByManagerId
   * @param {string|null} rejectionReason
   * @returns {Promise<any>}
   */
  async updateStatus(requestId, status, reviewedByManagerId, rejectionReason) {
    try {
      const allowed = new Set(Object.values(BillModRequestStatus));
      if (!allowed.has(status)) {
        throw new Error(`Invalid bill modification status: ${status}`);
      }
      const now = new Date().toISOString();
      const base = {
        status,
        reviewed_by_manager_id: reviewedByManagerId || null,
        reviewed_at: now,
        rejection_reason: rejectionReason || null,
      };
      if (status === BillModRequestStatus.REJECTED) {
        base.rejected_at = now;
      }
      return dbAdapter.update('bill_modification_requests', base, [{ column: 'id', value: requestId }]);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Manager approval: status + timestamps + optional note + display name.
   * Must run before KOT/bill side-effects (call order enforced in service).
   */
  async markApproved(requestId, reviewedByManagerId, approvedByDisplayName, approvalNote) {
    try {
      const now = new Date().toISOString();
      return dbAdapter.update(
        'bill_modification_requests',
        {
          status: BillModRequestStatus.APPROVED,
          reviewed_by_manager_id: reviewedByManagerId || null,
          reviewed_at: now,
          approved_at: now,
          approved_by: approvedByDisplayName || null,
          approved_reason: approvalNote || null,
          approved_by_display_name: approvedByDisplayName || null,
          approval_note: approvalNote || null,
          rejection_reason: null,
          rejected_at: null,
          rejected_by: null,
          rejected_by_display_name: null,
        },
        [{ column: 'id', value: requestId }]
      );
    } catch (err) {
      throw err;
    }
  },

  /**
   * Manager rejection: required reason, id + display name, timestamps.
   */
  async markRejected(requestId, reviewedByManagerId, rejectedByDisplayName, rejectionReason) {
    try {
      const now = new Date().toISOString();
      return dbAdapter.update(
        'bill_modification_requests',
        {
          status: BillModRequestStatus.REJECTED,
          reviewed_by_manager_id: reviewedByManagerId || null,
          reviewed_at: now,
          rejected_at: now,
          rejected_by: rejectedByDisplayName || null,
          rejected_by_display_name: rejectedByDisplayName || null,
          rejection_reason: rejectionReason,
          approved_at: null,
          approved_by: null,
          approved_reason: null,
          approved_by_display_name: null,
          approval_note: null,
        },
        [{ column: 'id', value: requestId }]
      );
    } catch (err) {
      throw err;
    }
  },

  /** Waiter's removal requests for this table (pending / rejected / approved history). */
  async listRecentForTableWaiter(tableNumber, waiterId, limit = 40) {
    try {
      if (waiterId == null) return [];
      return dbAdapter.select('bill_modification_requests', {
        filters: [
          { column: 'table_number', value: tableNumber },
          { column: 'waiter_id', value: waiterId },
        ],
        orderBy: 'requested_at',
        ascending: false,
        limit,
      });
    } catch (err) {
      throw err;
    }
  },

  /** Approved removal requests for a table (waiter summary annotations). */
  /**
   * Lists approved requests for a table.
   * @param {number} tableNumber
   * @param {number} [limit=50]
   * @returns {Promise<Array<object>>}
   */
  async listApprovedForTable(tableNumber, limit = 50) {
    try {
      return dbAdapter.select('bill_modification_requests', {
        filters: [
          { column: 'table_number', value: tableNumber },
          { column: 'status', value: BillModRequestStatus.APPROVED },
        ],
        orderBy: 'reviewed_at',
        ascending: false,
        limit,
      });
    } catch (err) {
      throw err;
    }
  },
};
