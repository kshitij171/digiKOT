import { getDb, nowIso } from './db/sqlite.js';
import { isValidDeviceCode, labelForDeviceCode } from '../src/lib/pagerPool.js';

const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

export function normalizeMac(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

function listDevices() {
  const db = getDb();
  return db.prepare('SELECT * FROM pager_devices ORDER BY display_order ASC').all();
}

export function nextFreeDeviceCode(devices) {
  const used = new Set(devices.map((d) => d.device_code));
  for (let n = 1; n <= 999; n++) {
    const code = `pager${n}`;
    if (!used.has(code)) return code;
  }
  throw new Error('No free pager device codes');
}

export async function upsertDeviceFromHello({ mac, ip, fw, state = 'on_root' }) {
  const macAddress = normalizeMac(mac);
  if (!MAC_REGEX.test(macAddress)) throw new Error('Invalid MAC format');

  const db = getDb();
  const devices = listDevices();
  const existing = devices.find((d) => d.mac_address === macAddress);
  const now = nowIso();

  if (existing) {
    db.prepare(
      `UPDATE pager_devices SET provision_state = ?, last_ip = ?, last_seen_at = ?, firmware_version = ?, updated_at = ?
       WHERE mac_address = ?`
    ).run(state, ip || existing.last_ip, now, fw || existing.firmware_version, now, macAddress);
    return db.prepare('SELECT * FROM pager_devices WHERE mac_address = ?').get(macAddress);
  }

  const deviceCode = nextFreeDeviceCode(devices);
  const maxOrd = devices.reduce((m, d) => Math.max(m, Number(d.display_order) || 0), 0);
  db.prepare(
    `INSERT INTO pager_devices
     (device_code, label, mac_address, display_order, active, provision_state, last_ip, last_seen_at, firmware_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
  ).run(
    deviceCode, labelForDeviceCode(deviceCode), macAddress, maxOrd + 1,
    state, ip || null, now, fw || null, now, now
  );
  return db.prepare('SELECT * FROM pager_devices WHERE device_code = ?').get(deviceCode);
}

export async function updateProvisionStatus({ deviceCode, provisionState, lastSeenAt }) {
  const code = String(deviceCode || '').trim().toLowerCase();
  if (!code) throw new Error('device_code required');
  const db = getDb();
  const now = lastSeenAt || nowIso();
  db.prepare(
    `UPDATE pager_devices SET provision_state = ?, last_seen_at = ?, updated_at = ? WHERE device_code = ?`
  ).run(provisionState, now, now, code);
  return db.prepare('SELECT * FROM pager_devices WHERE device_code = ?').get(code);
}

export async function updateProvisionByMac({ mac, provisionState, lastIp }) {
  const macAddress = normalizeMac(mac);
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `UPDATE pager_devices SET provision_state = ?, last_seen_at = ?, updated_at = ?, last_ip = COALESCE(?, last_ip)
     WHERE mac_address = ?`
  ).run(provisionState, now, now, lastIp, macAddress);
  return db.prepare('SELECT * FROM pager_devices WHERE mac_address = ?').get(macAddress);
}

export async function listPagerDevicesForSetup() {
  return listDevices();
}

export async function findDeviceByMac(mac) {
  const db = getDb();
  return db.prepare('SELECT * FROM pager_devices WHERE mac_address = ?').get(normalizeMac(mac)) || null;
}

export async function patchDeviceLabel({ mac, deviceCode, label }) {
  const macAddress = normalizeMac(mac);
  const code = String(deviceCode || '').trim().toLowerCase();
  if (!isValidDeviceCode(code)) throw new Error('Invalid device code');
  const cleanedLabel = String(label ?? '').trim() || labelForDeviceCode(code);
  if (cleanedLabel.length > 120) throw new Error('Label too long');

  const devices = listDevices();
  const conflict = devices.find((d) => d.device_code === code && d.mac_address !== macAddress);
  if (conflict) throw new Error('Device code already in use');

  const now = nowIso();
  const db = getDb();
  db.prepare(
    `UPDATE pager_devices SET device_code = ?, label = ?, updated_at = ? WHERE mac_address = ?`
  ).run(code, cleanedLabel, now, macAddress);
  return db.prepare('SELECT * FROM pager_devices WHERE mac_address = ?').get(macAddress);
}
