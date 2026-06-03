/**
 * Polls Supabase notifications, resolves waiter → pager via pager_assignments,
 * publishes JSON to MQTT topic kot/pager/{device_code}/notify.
 * Logs and skips when the waiter has no assigned pager.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MQTT_URL (e.g. mqtt://127.0.0.1:1883)
 * Optional: POLL_MS (default 2000), PAGER_BRIDGE_CURSOR (path to cursor JSON)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import mqtt from 'mqtt';
import path from 'path';

const POLL_MS = Number(process.env.POLL_MS || 2000) || 2000;
const CURSOR_FILE = path.resolve(process.cwd(), process.env.PAGER_BRIDGE_CURSOR || '.pager-bridge-cursor.json');
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

function loadCursor() {
  try {
    const raw = fs.readFileSync(CURSOR_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j.after_ts === 'string' && typeof j.after_id === 'string') return j;
  } catch {
    /* missing or invalid */
  }
  return { after_ts: new Date().toISOString(), after_id: MAX_UUID };
}

function saveCursor(c) {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify(c, null, 0), 'utf8');
}

function logLine(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mqttUrl = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let cursor = loadCursor();
let mqttClient = null;
let pollTimer = null;
let inPoll = false;

async function fetchActiveAssignments() {
  const { data, error } = await supabase
    .from('pager_assignments')
    .select('waiter_user_id, pager_device_id')
    .is('released_at', null);
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    map.set(row.waiter_user_id, row.pager_device_id);
  }
  return map;
}

function publishAsync(topic, payload) {
  return new Promise((resolve, reject) => {
    mqttClient.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function pollOnce() {
  if (inPoll) return;
  inPoll = true;
  try {
    const { data: notifications, error: nErr } = await supabase.rpc('fetch_notifications_after', {
      p_after_ts: cursor.after_ts,
      p_after_id: cursor.after_id,
      p_limit: 100,
    });
    if (nErr) throw nErr;
    const rows = notifications || [];
    if (rows.length === 0) {
      inPoll = false;
      return;
    }

    const waiterToPager = await fetchActiveAssignments();

    for (const n of rows) {
      const deviceCode = waiterToPager.get(n.target_user_id);
      if (!deviceCode) {
        logLine({
          level: 'info',
          msg: 'no_pager_for_waiter',
          notification_id: n.id,
          target_user_id: n.target_user_id,
          event_type: n.event_type,
        });
        cursor = { after_ts: n.created_at, after_id: n.id };
        saveCursor(cursor);
        continue;
      }

      const topic = `kot/pager/${deviceCode}/notify`;
      const payload = {
        notification_id: n.id,
        event_type: n.event_type,
        target_user_id: n.target_user_id,
        table_number: n.table_number,
        session_id: n.session_id,
        payload_json: n.payload_json,
        created_at: n.created_at,
      };

      if (!mqttClient?.connected) {
        logLine({ level: 'warn', msg: 'mqtt_not_connected', topic });
        return;
      }

      await publishAsync(topic, payload);
      logLine({ level: 'info', msg: 'published', topic, notification_id: n.id });
      cursor = { after_ts: n.created_at, after_id: n.id };
      saveCursor(cursor);
    }
  } catch (e) {
    logLine({ level: 'error', msg: 'poll_error', error: String(e?.message || e) });
  } finally {
    inPoll = false;
  }
}

mqttClient = mqtt.connect(mqttUrl);

mqttClient.on('connect', () => {
  logLine({ level: 'info', msg: 'mqtt_connected', mqttUrl });
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollOnce, POLL_MS);
  pollOnce();
});

mqttClient.on('error', (e) => {
  logLine({ level: 'error', msg: 'mqtt_error', error: String(e?.message || e) });
});

mqttClient.on('close', () => {
  logLine({ level: 'warn', msg: 'mqtt_close' });
});

process.on('SIGINT', () => {
  if (pollTimer) clearInterval(pollTimer);
  mqttClient?.end();
  process.exit(0);
});
