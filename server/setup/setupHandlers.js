import { publishJson } from '../mqtt/broker.js';
import {
  findDeviceByMac,
  listPagerDevicesForSetup,
  normalizeMac,
  patchDeviceLabel,
  updateProvisionByMac,
  upsertDeviceFromHello,
} from '../pagerProvisionDb.js';
import { getSetupStore, newCommandId } from './setupStore.js';
import { issueSetupToken } from './setupAuth.js';

const ROOT_TEST_STATES = new Set(['on_root', 'push_pending', 'wifi_failed']);
const MQTT_TEST_STATES = new Set(['mqtt_ok', 'on_restaurant_wifi', 'offline']);

function requireDeviceKey(body) {
  const expected = process.env.SETUP_DEVICE_KEY;
  if (!expected) return true;
  return body?.device_key === expected;
}

function queueCommand(store, mac, type, payload = {}) {
  const macKey = normalizeMac(mac);
  const cmd = {
    id: newCommandId(),
    type,
    payload,
    created_at: new Date().toISOString(),
  };
  store.commands.set(macKey, cmd);
  return cmd;
}

export function deviceToPublicRow(d) {
  return {
    device_code: d.device_code,
    label: d.label,
    mac_address: d.mac_address,
    last_ip: d.last_ip,
    last_seen_at: d.last_seen_at,
    firmware_version: d.firmware_version,
    provision_state: d.provision_state,
    active: d.active,
    display_order: d.display_order,
  };
}

async function publishTestNotify(deviceCode) {
  const topic = `kot/pager/${deviceCode}/notify`;
  await publishJson(topic, {
    event_type: 'test_beep',
    table_number: null,
    payload_json: { message: 'Setup test beep' },
    created_at: new Date().toISOString(),
  });
}

export async function setupAuth(body) {
  const password = process.env.SETUP_UI_PASSWORD;
  if (!password) {
    return { status: 500, body: { error: 'SETUP_UI_PASSWORD not configured' } };
  }
  if (body.password !== password) {
    return { status: 401, body: { error: 'Incorrect password' } };
  }
  const store = getSetupStore();
  const token = issueSetupToken(store);
  return { status: 200, body: { setupToken: token } };
}

export async function setupHello(body) {
  if (!requireDeviceKey(body)) {
    return { status: 403, body: { error: 'Invalid device key' } };
  }
  const device = await upsertDeviceFromHello({
    mac: body.mac,
    ip: body.ip,
    fw: body.fw || body.firmware_version,
    state: body.state || 'on_root',
  });
  return {
    status: 200,
    body: { ok: true, device_code: device.device_code, label: device.label },
  };
}

export async function setupCommand(mac) {
  if (!mac) return { status: 400, body: { error: 'mac required' } };
  const store = getSetupStore();
  const cmd = store.commands.get(normalizeMac(mac));
  return { status: 200, body: cmd || {} };
}

export async function setupAck(body) {
  const store = getSetupStore();
  const mac = normalizeMac(body.mac);
  const pending = store.commands.get(mac);
  if (pending && body.command_id === pending.id) {
    store.commands.delete(mac);
  }

  if (body.result === 'wifi_ok') {
    await updateProvisionByMac({ mac, provisionState: 'on_restaurant_wifi' });
  } else if (body.result === 'wifi_failed') {
    await updateProvisionByMac({ mac, provisionState: 'wifi_failed', lastIp: body.ip });
  } else if (body.result === 'forgot') {
    await updateProvisionByMac({ mac, provisionState: 'on_root' });
  }

  return { status: 200, body: { ok: true } };
}

export async function setupListDevices() {
  const store = getSetupStore();
  const devices = await listPagerDevicesForSetup();
  const wifiSaved = Boolean(store.restaurantWifi?.ssid);
  return {
    status: 200,
    body: {
      devices: devices.map(deviceToPublicRow),
      restaurant_wifi_saved: wifiSaved,
      mqtt_host: store.restaurantWifi?.mqtt_host || null,
      mqtt_port: store.restaurantWifi?.mqtt_port || 1883,
      restaurant_ssid: store.restaurantWifi?.ssid || null,
    },
  };
}

export async function setupPatchDevice(mac, body) {
  const updated = await patchDeviceLabel({
    mac,
    deviceCode: body.device_code,
    label: body.label,
  });
  return { status: 200, body: { device: deviceToPublicRow(updated) } };
}

export async function setupSaveRestaurantWifi(body) {
  const store = getSetupStore();
  const ssid = String(body.ssid || '').trim();
  const passwordRaw = String(body.password ?? '');
  const mqttHost = String(body.mqtt_host || '').trim();
  const mqttPort = Number(body.mqtt_port || 1883) || 1883;
  if (!ssid) return { status: 400, body: { error: 'SSID required' } };
  if (!mqttHost) return { status: 400, body: { error: 'MQTT host required' } };
  const password = passwordRaw || store.restaurantWifi?.password || '';
  if (!password) return { status: 400, body: { error: 'Wi-Fi password required on first save' } };
  store.restaurantWifi = { ssid, password, mqtt_host: mqttHost, mqtt_port: mqttPort };
  return {
    status: 200,
    body: { ok: true, restaurant_ssid: ssid, mqtt_host: mqttHost, mqtt_port: mqttPort },
  };
}

export async function setupPushAll() {
  const store = getSetupStore();
  if (!store.restaurantWifi?.ssid) {
    return { status: 400, body: { error: 'Save restaurant Wi-Fi config first' } };
  }
  const devices = await listPagerDevicesForSetup();
  const onRoot = devices.filter((d) => d.provision_state === 'on_root');
  const cfg = store.restaurantWifi;
  let queued = 0;
  for (const d of onRoot) {
    queueCommand(store, d.mac_address, 'APPLY_WIFI', {
      ssid: cfg.ssid,
      password: cfg.password,
      mqtt_host: cfg.mqtt_host,
      mqtt_port: cfg.mqtt_port,
      device_code: d.device_code,
    });
    await updateProvisionByMac({ mac: d.mac_address, provisionState: 'push_pending' });
    queued += 1;
  }
  return { status: 200, body: { ok: true, queued } };
}

export async function setupPushOne(mac) {
  const store = getSetupStore();
  if (!store.restaurantWifi?.ssid) {
    return { status: 400, body: { error: 'Save restaurant Wi-Fi config first' } };
  }
  const device = await findDeviceByMac(mac);
  if (!device) return { status: 404, body: { error: 'Device not found' } };
  const cfg = store.restaurantWifi;
  const cmd = queueCommand(store, mac, 'APPLY_WIFI', {
    ssid: cfg.ssid,
    password: cfg.password,
    mqtt_host: cfg.mqtt_host,
    mqtt_port: cfg.mqtt_port,
    device_code: device.device_code,
  });
  await updateProvisionByMac({ mac, provisionState: 'push_pending' });
  return { status: 200, body: { ok: true, command_id: cmd.id } };
}

export async function setupForget(mac) {
  const store = getSetupStore();
  const cmd = queueCommand(store, mac, 'FORGET_WIFI', {});
  return { status: 200, body: { ok: true, command_id: cmd.id } };
}

export async function setupTest(mac) {
  const store = getSetupStore();
  const device = await findDeviceByMac(mac);
  if (!device) return { status: 404, body: { error: 'Device not found' } };

  const state = device.provision_state;
  if (ROOT_TEST_STATES.has(state)) {
    const cmd = queueCommand(store, mac, 'TEST_BEEP', {});
    return { status: 200, body: { ok: true, path: 'command', command_id: cmd.id } };
  }
  if (MQTT_TEST_STATES.has(state)) {
    try {
      await publishTestNotify(device.device_code);
      return { status: 200, body: { ok: true, path: 'mqtt' } };
    } catch (e) {
      return { status: 502, body: { error: `MQTT test failed: ${e.message}` } };
    }
  }
  return { status: 400, body: { error: `Test beep not available in state: ${state}` } };
}
