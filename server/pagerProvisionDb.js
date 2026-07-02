import { createClient } from '@supabase/supabase-js';
import { isValidDeviceCode, labelForDeviceCode } from '../src/lib/pagerPool.js';

const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

export function normalizeMac(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listDevices(supabase) {
  const { data, error } = await supabase
    .from('pager_devices')
    .select('*')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export function nextFreeDeviceCode(devices) {
  const used = new Set(devices.map((d) => d.device_code));
  for (let n = 1; n <= 999; n++) {
    const code = `pager${n}`;
    if (!used.has(code)) return code;
  }
  throw new Error('No free pager device codes');
}

/**
 * ESP hello on ROOT — upsert by MAC, assign device_code on first sight.
 */
export async function upsertDeviceFromHello({ mac, ip, fw, state = 'on_root' }) {
  const macAddress = normalizeMac(mac);
  if (!MAC_REGEX.test(macAddress)) {
    throw new Error('Invalid MAC format');
  }

  const supabase = getSupabase();
  const devices = await listDevices(supabase);
  const existing = devices.find((d) => d.mac_address === macAddress);
  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from('pager_devices')
      .update({
        provision_state: state,
        last_ip: ip || existing.last_ip,
        last_seen_at: now,
        firmware_version: fw || existing.firmware_version,
        updated_at: now,
      })
      .eq('mac_address', macAddress)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const deviceCode = nextFreeDeviceCode(devices);
  const maxOrd = devices.reduce((m, d) => Math.max(m, Number(d.display_order) || 0), 0);
  const row = {
    device_code: deviceCode,
    label: labelForDeviceCode(deviceCode),
    mac_address: macAddress,
    display_order: maxOrd + 1,
    active: true,
    provision_state: state,
    last_ip: ip || null,
    last_seen_at: now,
    firmware_version: fw || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from('pager_devices').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateProvisionStatus({ deviceCode, provisionState, lastSeenAt }) {
  const code = String(deviceCode || '').trim().toLowerCase();
  if (!code) throw new Error('device_code required');

  const supabase = getSupabase();
  const now = lastSeenAt || new Date().toISOString();
  const { data, error } = await supabase
    .from('pager_devices')
    .update({
      provision_state: provisionState,
      last_seen_at: now,
      updated_at: now,
    })
    .eq('device_code', code)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateProvisionByMac({ mac, provisionState, lastIp }) {
  const macAddress = normalizeMac(mac);
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const patch = {
    provision_state: provisionState,
    last_seen_at: now,
    updated_at: now,
  };
  if (lastIp !== undefined) patch.last_ip = lastIp;

  const { data, error } = await supabase
    .from('pager_devices')
    .update(patch)
    .eq('mac_address', macAddress)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listPagerDevicesForSetup() {
  const supabase = getSupabase();
  return listDevices(supabase);
}

export async function findDeviceByMac(mac) {
  const macAddress = normalizeMac(mac);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pager_devices')
    .select('*')
    .eq('mac_address', macAddress)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function patchDeviceLabel({ mac, deviceCode, label }) {
  const macAddress = normalizeMac(mac);
  const code = String(deviceCode || '').trim().toLowerCase();
  if (!isValidDeviceCode(code)) {
    throw new Error('Invalid device code');
  }
  const cleanedLabel = String(label ?? '').trim() || labelForDeviceCode(code);
  if (cleanedLabel.length > 120) throw new Error('Label too long');

  const supabase = getSupabase();
  const devices = await listDevices(supabase);
  const conflict = devices.find((d) => d.device_code === code && d.mac_address !== macAddress);
  if (conflict) throw new Error('Device code already in use');

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('pager_devices')
    .update({
      device_code: code,
      label: cleanedLabel,
      updated_at: now,
    })
    .eq('mac_address', macAddress)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
