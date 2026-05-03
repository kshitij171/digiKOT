import { dbAdapter } from '../lib/db/dbAdapter';

export const pagerRepository = {
  async listDevices() {
    return dbAdapter.select('pager_devices', {
      orderBy: 'display_order',
      ascending: true,
    });
  },

  async findDeviceByCode(deviceCode) {
    return dbAdapter.select('pager_devices', {
      filters: [{ column: 'device_code', value: deviceCode }],
      single: true,
    });
  },

  /** Expects MAC already normalized (uppercase) by the service layer. */
  async findDeviceByMac(macAddress) {
    return dbAdapter.select('pager_devices', {
      filters: [{ column: 'mac_address', value: macAddress }],
      single: true,
    });
  },

  async insertDevice(row) {
    return dbAdapter.insert('pager_devices', row);
  },

  async deleteDevice(deviceCode) {
    return dbAdapter.delete('pager_devices', [{ column: 'device_code', value: deviceCode }]);
  },

  async listActiveAssignments() {
    return dbAdapter.select('pager_assignments', {
      filters: [{ column: 'released_at', operator: 'is', value: null }],
      orderBy: 'assigned_at',
      ascending: true,
    });
  },

  async findActiveAssignmentForWaiter(waiterUserId) {
    return dbAdapter.select('pager_assignments', {
      filters: [
        { column: 'waiter_user_id', value: waiterUserId },
        { column: 'released_at', operator: 'is', value: null },
      ],
      single: true,
    });
  },

  async findActiveAssignmentForPager(deviceCode) {
    return dbAdapter.select('pager_assignments', {
      filters: [
        { column: 'pager_device_id', value: deviceCode },
        { column: 'released_at', operator: 'is', value: null },
      ],
      single: true,
    });
  },

  async insertAssignment(row) {
    return dbAdapter.insert('pager_assignments', row);
  },

  async releaseAssignmentForPager(deviceCode) {
    const now = new Date().toISOString();
    await dbAdapter.update(
      'pager_assignments',
      { released_at: now },
      [
        { column: 'pager_device_id', value: deviceCode },
        { column: 'released_at', operator: 'is', value: null },
      ],
    );
  },

  async releaseAssignmentsForWaiter(waiterUserId) {
    const now = new Date().toISOString();
    await dbAdapter.update(
      'pager_assignments',
      { released_at: now },
      [
        { column: 'waiter_user_id', value: waiterUserId },
        { column: 'released_at', operator: 'is', value: null },
      ],
    );
  },
};
