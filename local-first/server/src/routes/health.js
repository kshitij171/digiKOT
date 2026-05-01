import { dbHealth } from '../db/pool.js';
import { getMqttState } from '../mqtt/mqttClient.js';
import { getSocketStats } from '../realtime/socketHub.js';

export async function healthRoutes(fastify, { pool, env }) {
  fastify.get('/health', async () => ({ ok: true }));

  fastify.get('/system/status', async () => {
    let postgresOk = false;
    try {
      postgresOk = await dbHealth(env.databaseUrl);
    } catch {
      postgresOk = false;
    }

    const mqtt = getMqttState();
    const sockets = getSocketStats();

    return {
      ok: postgresOk && mqtt.connected,
      postgres: { connected: postgresOk },
      mqtt: {
        connected: mqtt.connected,
        lastError: mqtt.lastError,
        lastPublishedAt: mqtt.lastPublishedAt,
        brokerUrl: env.mqttUrl,
      },
      socketio: sockets,
      server: {
        port: env.port,
        listenHost: env.listenHost,
        nodeEnv: env.nodeEnv,
        defaultRestaurantId: env.defaultRestaurantId,
      },
      urls: {
        devWeb: 'http://localhost:5173',
        devApi: `http://localhost:${env.port}`,
        lanWebDev: 'http://SERVER_IP:5173',
        lanApiDev: `http://SERVER_IP:${env.port}`,
        prodLan: 'http://SERVER_IP',
        mqtt: 'SERVER_IP:1883',
      },
    };
  });
}
