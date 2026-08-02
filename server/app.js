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

// Quiet by default: no per-request access logs. Set REQUEST_LOG=1 for verbose request tracing.
// LOG_LEVEL overrides Pino level (default warn — errors/warnings only).
const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'warn' },
  disableRequestLogging: process.env.REQUEST_LOG !== '1',
  // Vite (and other) proxies on the same machine — trust X-Forwarded-* for client IP.
  trustProxy: true,
});
fastify.decorate('config', config);
registerDevDiagnosticsHooks(fastify);

function isDevAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    // Private LAN ranges (phones/tablets on Wi‑Fi)
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

await fastify.register(cors, {
  origin: config.nodeEnv === 'production' ? true : (origin, cb) => {
    cb(null, isDevAllowedOrigin(origin));
  },
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

// Print reachable LAN URLs (skip virtual adapters like Hyper-V / WSL when possible).
try {
  const { networkInterfaces } = await import('node:os');
  const nets = networkInterfaces();
  const lan = [];
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      // Prefer typical home/office Wi‑Fi ranges; still list others.
      lan.push(net.address);
    }
  }
  const preferred = lan.filter((ip) => ip.startsWith('192.168.') || ip.startsWith('10.'));
  const show = preferred.length ? preferred : lan;
  if (show.length) {
    console.log('Other devices on Wi‑Fi — open one of:');
    for (const ip of show) {
      console.log(`  UI  http://${ip}:5173   (npm run dev:all)`);
      console.log(`  UI  http://${ip}:${config.port}   (npm run build && npm start)`);
    }
  }
} catch {
  // ignore
}

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
