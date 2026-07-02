import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
import { startSetupDiscovery } from './setupDiscovery.js';
import {
  findDeviceByMac,
  listPagerDevicesForSetup,
  normalizeMac,
  patchDeviceLabel,
  updateProvisionByMac,
  upsertDeviceFromHello,
} from './pagerProvisionDb.js';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const SETUP_PREFIX = '/api/setup';

function applyRootEnv(mode, root) {
  const env = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function parseUrl(req) {
  const u = new URL(req.url || '/', 'http://localhost');
  return { pathname: u.pathname, searchParams: u.searchParams };
}

function newCommandId() {
  return randomBytes(8).toString('hex');
}

function createStore() {
  return {
    tokens: new Map(),
    commands: new Map(),
    restaurantWifi: null,
  };
}

function getBearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

function requireSetupToken(store, req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing setup token' };
  const entry = store.tokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) store.tokens.delete(token);
    return { ok: false, status: 401, error: 'Invalid or expired setup token' };
  }
  return { ok: true, token };
}

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

function deviceToPublicRow(d) {
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

let mqttClient = null;
let mqttConnecting = null;

async function getMqttClient() {
  const url = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
  if (mqttClient?.connected) return mqttClient;
  if (mqttConnecting) return mqttConnecting;

  mqttConnecting = new Promise((resolve, reject) => {
    import('mqtt')
      .then(({ default: mqtt }) => {
        const client = mqtt.connect(url);
        const timer = setTimeout(() => {
          client.end(true);
          reject(new Error('MQTT connect timeout'));
        }, 5000);

        client.on('connect', () => {
          clearTimeout(timer);
          mqttClient = client;
          mqttConnecting = null;
          resolve(client);
        });
        client.on('error', (e) => {
          clearTimeout(timer);
          mqttConnecting = null;
          reject(e);
        });
      })
      .catch(reject);
  });

  return mqttConnecting;
}

async function publishTestNotify(deviceCode) {
  const client = await getMqttClient();
  const topic = `kot/pager/${deviceCode}/notify`;
  const payload = {
    event_type: 'test_beep',
    table_number: null,
    payload_json: { message: 'Setup test beep' },
    created_at: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const ROOT_TEST_STATES = new Set(['on_root', 'push_pending', 'wifi_failed']);
const MQTT_TEST_STATES = new Set(['mqtt_ok', 'on_restaurant_wifi', 'offline']);

async function handleSetupRequest(req, res, store) {
  const { pathname, searchParams } = parseUrl(req);
  if (!pathname.startsWith(SETUP_PREFIX)) return false;

  try {
    if (pathname === `${SETUP_PREFIX}/auth` && req.method === 'POST') {
      const body = await readJsonBody(req);
      const password = process.env.SETUP_UI_PASSWORD;
      if (!password) {
        sendJson(res, 500, { error: 'SETUP_UI_PASSWORD not configured' });
        return true;
      }
      if (body.password !== password) {
        sendJson(res, 401, { error: 'Incorrect password' });
        return true;
      }
      const token = randomBytes(24).toString('hex');
      store.tokens.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS });
      sendJson(res, 200, { setupToken: token });
      return true;
    }

    if (pathname === `${SETUP_PREFIX}/hello` && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!requireDeviceKey(body)) {
        sendJson(res, 403, { error: 'Invalid device key' });
        return true;
      }
      const device = await upsertDeviceFromHello({
        mac: body.mac,
        ip: body.ip,
        fw: body.fw || body.firmware_version,
        state: body.state || 'on_root',
      });
      sendJson(res, 200, {
        ok: true,
        device_code: device.device_code,
        label: device.label,
      });
      return true;
    }

    if (pathname === `${SETUP_PREFIX}/command` && req.method === 'GET') {
      const mac = searchParams.get('mac');
      if (!mac) {
        sendJson(res, 400, { error: 'mac required' });
        return true;
      }
      const cmd = store.commands.get(normalizeMac(mac));
      sendJson(res, 200, cmd || {});
      return true;
    }

    if (pathname === `${SETUP_PREFIX}/ack` && req.method === 'POST') {
      const body = await readJsonBody(req);
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

      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === `${SETUP_PREFIX}/devices` && req.method === 'GET') {
      const auth = requireSetupToken(store, req);
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return true;
      }
      const devices = await listPagerDevicesForSetup();
      const wifiSaved = Boolean(store.restaurantWifi?.ssid);
      sendJson(res, 200, {
        devices: devices.map(deviceToPublicRow),
        restaurant_wifi_saved: wifiSaved,
        mqtt_host: store.restaurantWifi?.mqtt_host || null,
        mqtt_port: store.restaurantWifi?.mqtt_port || 1883,
        restaurant_ssid: store.restaurantWifi?.ssid || null,
      });
      return true;
    }

    const patchMatch = /^\/api\/setup\/devices\/([^/]+)$/.exec(pathname);
    if (patchMatch && req.method === 'PATCH') {
      const auth = requireSetupToken(store, req);
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return true;
      }
      const mac = decodeURIComponent(patchMatch[1]);
      const body = await readJsonBody(req);
      const updated = await patchDeviceLabel({
        mac,
        deviceCode: body.device_code,
        label: body.label,
      });
      sendJson(res, 200, { device: deviceToPublicRow(updated) });
      return true;
    }

    if (pathname === `${SETUP_PREFIX}/restaurant-wifi` && req.method === 'POST') {
      const auth = requireSetupToken(store, req);
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return true;
      }
      const body = await readJsonBody(req);
      const ssid = String(body.ssid || '').trim();
      const passwordRaw = String(body.password ?? '');
      const mqttHost = String(body.mqtt_host || '').trim();
      const mqttPort = Number(body.mqtt_port || 1883) || 1883;
      if (!ssid) {
        sendJson(res, 400, { error: 'SSID required' });
        return true;
      }
      if (!mqttHost) {
        sendJson(res, 400, { error: 'MQTT host required' });
        return true;
      }
      const password =
        passwordRaw || store.restaurantWifi?.password || '';
      if (!password) {
        sendJson(res, 400, { error: 'Wi-Fi password required on first save' });
        return true;
      }
      store.restaurantWifi = { ssid, password, mqtt_host: mqttHost, mqtt_port: mqttPort };
      sendJson(res, 200, { ok: true, restaurant_ssid: ssid, mqtt_host: mqttHost, mqtt_port: mqttPort });
      return true;
    }

    if (pathname === `${SETUP_PREFIX}/push-all` && req.method === 'POST') {
      const auth = requireSetupToken(store, req);
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return true;
      }
      if (!store.restaurantWifi?.ssid) {
        sendJson(res, 400, { error: 'Save restaurant Wi-Fi config first' });
        return true;
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
      sendJson(res, 200, { ok: true, queued });
      return true;
    }

    const pushMatch = /^\/api\/setup\/push\/([^/]+)$/.exec(pathname);
    if (pushMatch && req.method === 'POST') {
      const auth = requireSetupToken(store, req);
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return true;
      }
      if (!store.restaurantWifi?.ssid) {
        sendJson(res, 400, { error: 'Save restaurant Wi-Fi config first' });
        return true;
      }
      const mac = decodeURIComponent(pushMatch[1]);
      const device = await findDeviceByMac(mac);
      if (!device) {
        sendJson(res, 404, { error: 'Device not found' });
        return true;
      }
      const cfg = store.restaurantWifi;
      const cmd = queueCommand(store, mac, 'APPLY_WIFI', {
        ssid: cfg.ssid,
        password: cfg.password,
        mqtt_host: cfg.mqtt_host,
        mqtt_port: cfg.mqtt_port,
        device_code: device.device_code,
      });
      await updateProvisionByMac({ mac, provisionState: 'push_pending' });
      sendJson(res, 200, { ok: true, command_id: cmd.id });
      return true;
    }

    const forgetMatch = /^\/api\/setup\/forget\/([^/]+)$/.exec(pathname);
    if (forgetMatch && req.method === 'POST') {
      const auth = requireSetupToken(store, req);
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return true;
      }
      const mac = decodeURIComponent(forgetMatch[1]);
      const cmd = queueCommand(store, mac, 'FORGET_WIFI', {});
      sendJson(res, 200, { ok: true, command_id: cmd.id });
      return true;
    }

    const testMatch = /^\/api\/setup\/test\/([^/]+)$/.exec(pathname);
    if (testMatch && req.method === 'POST') {
      const auth = requireSetupToken(store, req);
      if (!auth.ok) {
        sendJson(res, auth.status, { error: auth.error });
        return true;
      }
      const mac = decodeURIComponent(testMatch[1]);
      const device = await findDeviceByMac(mac);
      if (!device) {
        sendJson(res, 404, { error: 'Device not found' });
        return true;
      }

      const state = device.provision_state;
      if (ROOT_TEST_STATES.has(state)) {
        const cmd = queueCommand(store, mac, 'TEST_BEEP', {});
        sendJson(res, 200, { ok: true, path: 'command', command_id: cmd.id });
        return true;
      }
      if (MQTT_TEST_STATES.has(state)) {
        try {
          await publishTestNotify(device.device_code);
          sendJson(res, 200, { ok: true, path: 'mqtt' });
        } catch (e) {
          sendJson(res, 502, { error: `MQTT test failed: ${e.message}` });
        }
        return true;
      }
      sendJson(res, 400, { error: `Test beep not available in state: ${state}` });
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Setup API error' });
    return true;
  }
}

function setupMiddleware(server, store) {
  applyRootEnv(server.config.mode, server.config.root);

  return async (req, res, next) => {
    const handled = await handleSetupRequest(req, res, store);
    if (handled) return;
    next();
  };
}

function attachSetupServer(server, store) {
  server.middlewares.use(setupMiddleware(server, store));
  startSetupDiscovery(server);
}

/** Vite plugin: /api/setup/* for ESP provisioning (dev + preview). */
export function setupApiPlugin() {
  const store = createStore();
  return {
    name: 'setup-api',
    configureServer(server) {
      return attachSetupServer(server, store);
    },
    configurePreviewServer(server) {
      return attachSetupServer(server, store);
    },
  };
}
