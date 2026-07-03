import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadServerEnv } from './config/env.js';
import { migrate } from './db/migrate.js';
import { closeDb, getDb } from './db/sqlite.js';
import { authRoutes } from './routes/auth.js';
import { dataRoutes } from './routes/data.js';
import { setupRoutes } from './routes/setup.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { attachSocketIo, getSocketStats } from './realtime/socketHub.js';
import { startMqttBroker, stopMqttBroker, getMqttBroker } from './mqtt/broker.js';
import { startPagerNotifyWorker } from './workers/pagerNotifyWorker.js';
import { startSetupDiscovery } from './setupDiscovery.js';
import { initFileLogger, logLine } from './lib/fileLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const APP_VERSION = readPackageVersion();

const config = loadServerEnv();
initFileLogger(config.databasePath || path.join(repoRoot, 'data', 'digikot.db'));
migrate(config.databasePath || undefined);

const fastify = Fastify({ logger: true });
fastify.decorate('config', config);

await fastify.register(cors, {
  origin: config.nodeEnv === 'production' ? true : [/^http:\/\/localhost:\d+$/, /^http:\/\/192\.168\.\d+\.\d+:\d+$/],
  credentials: true,
});

await fastify.register(cookie);

fastify.get('/api/health', async () => {
  let dbOk = false;
  try {
    getDb().prepare('SELECT 1').get();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const socket = getSocketStats();
  return {
    ok: dbOk,
    version: APP_VERSION,
    node: process.version,
    db: dbOk,
    mqtt: Boolean(getMqttBroker()),
    socketClients: socket.connectedClients,
    ts: new Date().toISOString(),
  };
});

await fastify.register(authRoutes, { prefix: '/api' });
await fastify.register(dataRoutes, { prefix: '/api' });
await fastify.register(setupRoutes, { prefix: '/api' });
await fastify.register(whatsappRoutes, { prefix: '/api' });

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

logLine('info', `digiKOT v${APP_VERSION} http://${config.listenHost}:${config.port} mqtt :${config.mqttPort}`);
console.log(`digiKOT server http://${config.listenHost}:${config.port} mqtt :${config.mqttPort}`);

const shutdown = async () => {
  stopPagerWorker();
  await stopMqttBroker();
  await fastify.close();
  closeDb();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
