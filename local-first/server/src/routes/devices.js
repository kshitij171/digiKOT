import { enqueueTestNotification } from '../services/deviceTestNotification.js';

export async function deviceRoutes(fastify, { pool, env }) {
  fastify.get('/devices', async () => {
    const r = await pool.query(
      `select id, restaurant_id, device_id, device_name, device_type,
              assigned_role, assigned_target_id, mqtt_username, status,
              last_seen_at, last_ack_at, wifi_rssi, created_at
       from devices
       where restaurant_id = $1
       order by device_id asc`,
      [env.defaultRestaurantId]
    );
    return { devices: r.rows };
  });

  fastify.post('/devices/test-notification', async (request, reply) => {
    const body = request.body || {};
    const deviceId = body.deviceId || body.device_id;
    if (!deviceId || typeof deviceId !== 'string') {
      return reply.code(400).send({ error: 'deviceId is required' });
    }
    try {
      const result = await enqueueTestNotification(pool, {
        restaurantId: env.defaultRestaurantId,
        deviceId,
      });
      return {
        ok: true,
        notificationId: result.notificationId,
        topic: result.topic,
        device: result.device,
      };
    } catch (e) {
      if (e.statusCode === 404) {
        return reply.code(404).send({ error: e.message });
      }
      throw e;
    }
  });
}
