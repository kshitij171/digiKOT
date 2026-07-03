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
import { setupRoutes } from './routes/setup.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { attachSocketIo, getSocketStats } from './realtime/socketHub.js';
import { startMqttBroker, stopMqttBroker, getMqttBroker } from './mqtt/broker.js';
import { startPagerNotifyWorker } from './workers/pagerNotifyWorker.js';
import { startSetupDiscovery } from './setupDiscovery.js';
import { initFileLogger, logLine } from './lib/fileLogger.js';
import { readAppVersion } from './lib/appVersion.js';
import { initDevDiagnostics, appendDevLog, isDevDiagnosticsEnabled } from './lib/devDiagnostics.js';
import { registerDevDiagnosticsHooks } from './middleware/devDiagnostics.js';
import { devLogRoutes } from './routes/devLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const APP_VERSION = readAppVersion();

const config = loadServerEnv();
initFileLogger(config.databasePath || path.join(repoRoot, 'data', 'digikot.db'));
migrate(config.databasePath || undefined);
if (isDevDiagnosticsEnabled()) initDevDiagnostics();

const fastify = Fastify({ logger: true });
fastify.decorate('config', config);
registerDevDiagnosticsHooks(fastify);

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
await fastify.register(devLogRoutes, { prefix: '/api' });

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

if (isDevDiagnosticsEnabled()) {
  appendDevLog({
    layer: 'server',
    event: 'server.start',
    meta: { version: APP_VERSION, port: config.port, mqttPort: config.mqttPort },
  });
}

let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    stopPagerWorker();
    await stopMqttBroker();
    await fastify.close();
    closeDb();
  } catch (err) {
    fastify.log.error(err, `shutdown error (${signal || 'unknown'})`);
  }
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
