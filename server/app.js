import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerEnv } from './config/env.js';
import { migrate } from './db/migrate.js';
import { closeDb, getDb } from './db/sqlite.js';
import { authRoutes } from './routes/auth.js';
import { dataRoutes } from './routes/data.js';
import { attachSocketIo } from './realtime/socketHub.js';
import { startMqttBroker, stopMqttBroker } from './mqtt/broker.js';
import { startPagerNotifyWorker } from './workers/pagerNotifyWorker.js';
import { startSetupDiscovery } from './setupDiscovery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const config = loadServerEnv();
migrate(config.databasePath || undefined);

const fastify = Fastify({ logger: true });
fastify.decorate('config', config);

await fastify.register(cors, {
  origin: config.nodeEnv === 'production' ? true : [/^http:\/\/localhost:\d+$/, /^http:\/\/192\.168\.\d+\.\d+:\d+$/],
  credentials: true,
});

await fastify.register(cookie);

fastify.get('/api/health', async () => ({
  ok: true,
  db: true,
  ts: new Date().toISOString(),
}));

await fastify.register(authRoutes, { prefix: '/api' });
await fastify.register(dataRoutes, { prefix: '/api' });

const distPath = path.join(repoRoot, 'dist');
try {
  await fastify.register(fastifyStatic, {
    root: distPath,
    prefix: '/',
    wildcard: false,
  });
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/socket.io')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    reply.sendFile('index.html');
  });
} catch {
  fastify.log.warn('dist/ not found — run npm run build for production UI');
}

await fastify.listen({ port: config.port, host: config.listenHost });

attachSocketIo(fastify.server, {
  corsOrigin: true,
  sessionSecret: config.sessionSecret,
});

await startMqttBroker(config.mqttPort, config.listenHost);
const stopPagerWorker = startPagerNotifyWorker();
startSetupDiscovery({
  httpServer: fastify.server,
  config: { server: { port: config.port }, logger: { info: (msg) => fastify.log.info(msg) } },
});

const shutdown = async () => {
  stopPagerWorker();
  await stopMqttBroker();
  await fastify.close();
  closeDb();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`digiKOT server http://${config.listenHost}:${config.port} mqtt :${config.mqttPort}`);
