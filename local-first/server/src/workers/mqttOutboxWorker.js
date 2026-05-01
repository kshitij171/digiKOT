import { publishJson, getMqttState } from '../mqtt/mqttClient.js';

const MAX_ATTEMPTS = 25;

/**
 * @param {object} opts
 * @param {import('pg').Pool} opts.pool
 * @param {number} [opts.pollMs]
 */
export function startMqttOutboxWorker({ pool, pollMs = 750 }) {
  let stopped = false;

  async function processBatch() {
    const { connected } = getMqttState();
    if (!connected) return;

    const sel = await pool.query(
      `select id, topic, payload, attempt_count
       from mqtt_outbox
       where status = 'pending'
       order by id asc
       limit 15`
    );

    for (const row of sel.rows) {
      try {
        const body = JSON.parse(row.payload);
        await publishJson(row.topic, body);
        await pool.query(
          `update mqtt_outbox
           set status = 'published', published_at = now(), last_error = null
           where id = $1 and status = 'pending'`,
          [row.id]
        );
      } catch (e) {
        const msg = e?.message || String(e);
        const nextAttempts = row.attempt_count + 1;
        const nextStatus = nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await pool.query(
          `update mqtt_outbox
           set attempt_count = attempt_count + 1,
               last_error = $2,
               status = $3
           where id = $1`,
          [row.id, msg, nextStatus]
        );
      }
    }
  }

  const tick = async () => {
    if (stopped) return;
    try {
      await processBatch();
    } catch {
      // survive transient errors
    }
  };

  const id = setInterval(tick, pollMs);
  tick();

  return () => {
    stopped = true;
    clearInterval(id);
  };
}
