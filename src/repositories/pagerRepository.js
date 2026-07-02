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

  async updateProvisionStatus(deviceCode, patch) {
    const now = new Date().toISOString();
    return dbAdapter.update(
      'pager_devices',
      { ...patch, updated_at: now },
      [{ column: 'device_code', value: deviceCode }],
    );
  },

  async upsertDeviceFromHello({ macAddress, lastIp, firmwareVersion, provisionState }) {
    const existing = await this.findDeviceByMac(macAddress).catch(() => null);
    const now = new Date().toISOString();
    if (existing) {
      await dbAdapter.update(
        'pager_devices',
        {
          provision_state: provisionState,
          last_ip: lastIp ?? existing.last_ip,
          last_seen_at: now,
          firmware_version: firmwareVersion ?? existing.firmware_version,
          updated_at: now,
        },
        [{ column: 'mac_address', value: macAddress }],
      );
      return this.findDeviceByMac(macAddress);
    }
    throw new Error('Device not found — use setup hello API for registration');
  },
};
