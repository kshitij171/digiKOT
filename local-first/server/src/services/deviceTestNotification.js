import crypto from 'crypto';
import { topicKitchenEvents } from '../topics.js';

/**
 * Inserts app-level notification + mqtt_outbox row in one transaction.
 * Publishes happen asynchronously via mqttOutboxWorker.
 */
export async function enqueueTestNotification(pool, { restaurantId, deviceId }) {
  const devRes = await pool.query(
    `select id, device_id, device_name, mqtt_username
     from devices
     where restaurant_id = $1 and device_id = $2`,
    [restaurantId, deviceId]
  );
  const device = devRes.rows[0];
  if (!device) {
    throw Object.assign(new Error('Device not found'), { statusCode: 404 });
  }

  const notificationId = crypto.randomUUID();
  const topic = topicKitchenEvents(restaurantId);
  const mqttPayload = {
    v: 1,
    kind: 'test_notification',
    restaurantId,
    deviceId: device.device_id,
    deviceDbId: device.id,
    title: 'Test',
    message: 'Server test notification (MQTT)',
    at: new Date().toISOString(),
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `insert into notifications (
        id, restaurant_id, type, target_type, target_id, title, message, payload, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        notificationId,
        restaurantId,
        'test',
        'device',
        device.id,
        'Test',
        mqttPayload.message,
        { topic, mqtt: mqttPayload },
        'unread',
      ]
    );
    await client.query(
      `insert into mqtt_outbox (topic, payload, status)
       values ($1, $2, 'pending')`,
      [topic, JSON.stringify(mqttPayload)]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { notificationId, topic, device };
}
