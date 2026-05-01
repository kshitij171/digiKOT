import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadEnv } from './config/env.js';
import { getPool } from './db/pool.js';
import { connectMqtt, getMqttState } from './mqtt/mqttClient.js';
import { startMqttOutboxWorker } from './workers/mqttOutboxWorker.js';
import { attachSocketIo } from './realtime/socketHub.js';
import { healthRoutes } from './routes/health.js';
import { deviceRoutes } from './routes/devices.js';

const env = loadEnv();
const pool = getPool(env.databaseUrl);

const fastify = Fastify({ logger: true });

const corsOrigin =
  env.nodeEnv === 'production'
    ? true
    : ['http://localhost:5173', /^http:\/\/192\.168\.\d+\.\d+:5173$/];

await fastify.register(cors, {
  origin: corsOrigin,
  credentials: true,
});

fastify.setErrorHandler((err, request, reply) => {
  const status = err.statusCode || 500;
  if (status >= 500) request.log.error(err);
  reply.status(status).send({ error: err.message || 'Internal error' });
});

await fastify.register(healthRoutes, { prefix: '/api', pool, env });
await fastify.register(deviceRoutes, { prefix: '/api', pool, env });

await fastify.listen({ port: env.port, host: env.listenHost });

attachSocketIo(fastify.server, { corsOrigin: true });

connectMqtt({
  url: env.mqttUrl,
  username: env.mqttUser,
  password: env.mqttPassword,
  onConnect: () => fastify.log.info({ mqtt: getMqttState() }, 'MQTT connected'),
  onError: (err) => fastify.log.warn({ err }, 'MQTT error'),
});

const stopWorker = startMqttOutboxWorker({ pool });

const shutdown = async () => {
  stopWorker();
  await fastify.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
