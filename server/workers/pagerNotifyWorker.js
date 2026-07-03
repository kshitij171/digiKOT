import { getDb } from '../db/sqlite.js';
import { publishJson, subscribeTopic } from '../mqtt/broker.js';

const STATUS_TOPIC = 'kot/pager/+/status';
const MAX_ATTEMPTS = 25;

export function startPagerNotifyWorker() {
  const db = getDb();
  let stopped = false;

  async function processPending() {
    if (stopped) return;

    const rows = db
      .prepare(
        `SELECT n.*, pa.pager_device_id
         FROM notifications n
         LEFT JOIN pager_assignments pa
           ON pa.waiter_user_id = n.target_user_id AND pa.released_at IS NULL
         WHERE n.mqtt_publish_status = 'pending'
         ORDER BY n.created_at ASC, n.id ASC
         LIMIT 50`
      )
      .all();

    for (const n of rows) {
      if (!n.pager_device_id) {
        db.prepare(
          `UPDATE notifications SET mqtt_publish_status = 'skipped', mqtt_last_error = NULL WHERE id = ?`
        ).run(n.id);
        continue;
      }

      const topic = `kot/pager/${n.pager_device_id}/notify`;
      const payload = {
        notification_id: n.id,
        event_type: n.event_type,
        target_user_id: n.target_user_id,
        table_number: n.table_number,
        session_id: n.session_id,
        payload_json: n.payload_json ? JSON.parse(n.payload_json) : null,
        created_at: n.created_at,
      };

      try {
        await publishJson(topic, payload);
        db.prepare(
          `UPDATE notifications
           SET mqtt_publish_status = 'published', mqtt_published_at = ?, mqtt_last_error = NULL
           WHERE id = ? AND mqtt_publish_status = 'pending'`
        ).run(new Date().toISOString(), n.id);
      } catch (e) {
        const msg = e?.message || String(e);
        const attempts = (n.mqtt_attempt_count || 0) + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        db.prepare(
          `UPDATE notifications
           SET mqtt_attempt_count = ?, mqtt_last_error = ?, mqtt_publish_status = ?
           WHERE id = ?`
        ).run(attempts, msg, status, n.id);
      }
    }
  }

  subscribeTopic(STATUS_TOPIC, (topic, payloadBuf) => {
    const parts = topic.split('/');
    const deviceCode = parts[2];
    if (!deviceCode) return;

    const raw = String(payloadBuf?.toString?.() || '').trim();
    let status = raw;
    let ip = null;
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        status = String(parsed.status || '').toLowerCase();
        ip = parsed.ip || null;
      } catch { return; }
    }

    let provisionState = null;
    if (status === 'online') provisionState = 'mqtt_ok';
    else if (status === 'offline') provisionState = 'offline';
    else return;

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE pager_devices SET provision_state = ?, last_seen_at = ?, updated_at = ?, last_ip = COALESCE(?, last_ip)
       WHERE device_code = ?`
    ).run(provisionState, now, now, ip, deviceCode);
  });

  const id = setInterval(() => {
    processPending().catch(() => {});
  }, 2000);
  processPending().catch(() => {});

  return () => {
    stopped = true;
    clearInterval(id);
  };
}
