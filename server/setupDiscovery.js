import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';

export const DISCOVERY_PORT = 50505;
export const DISCOVERY_PROBE_PREFIX = 'DIGIKOT_DISCOVER';
export const DISCOVERY_REPLY_PREFIX = 'DIGIKOT_SERVER ';

/** @type {import('node:dgram').Socket | null} */
let discoverySocket = null;
/** @type {import('node:http').Server | null} */
let discoveryHttpServer = null;

function ipToLong(ip) {
  const parts = String(ip).split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    (parts[3] >>> 0)
  );
}

function sameSubnet(localIp, netmask, remoteIp) {
  const a = ipToLong(localIp);
  const m = ipToLong(netmask);
  const b = ipToLong(remoteIp);
  if (a === null || m === null || b === null) return false;
  return (a & m) === (b & m);
}

function isPrivateIpv4(ip) {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

function pickAnyLanIp() {
  const nets = networkInterfaces();
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue;
    for (const a of addrs) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal || !a.address) continue;
      if (isPrivateIpv4(a.address)) return a.address;
    }
  }
  return null;
}

function pickMatchedIp(senderIp) {
  if (senderIp === '127.0.0.1' || senderIp === '::1') {
    return pickAnyLanIp();
  }
  const nets = networkInterfaces();
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue;
    for (const a of addrs) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal || !a.address || !a.netmask) continue;
      if (sameSubnet(a.address, a.netmask, senderIp)) return a.address;
    }
  }
  return null;
}

function resolveVitePort(server) {
  const addr = server.httpServer?.address?.();
  if (typeof addr === 'object' && addr?.port) return addr.port;
  return server.config?.server?.port || 5173;
}

function stopDiscovery() {
  if (discoverySocket) {
    try {
      discoverySocket.close();
    } catch {
      /* ignore */
    }
    discoverySocket = null;
  }
  if (discoveryHttpServer) {
    discoveryHttpServer.removeAllListeners('close');
    discoveryHttpServer = null;
  }
}

/**
 * Start UDP discovery responder after Vite's HTTP server is listening.
 * Lifecycle is tied to httpServer 'close' — not configureServer cleanup (Vite
 * invokes that before listen on port-retry / reload, which caused bind-after-close).
 * @param {import('vite').ViteDevServer} server
 */
export function startSetupDiscovery(server) {
  const log = (msg) => {
    if (server?.config?.logger?.info) server.config.logger.info(msg);
    else console.log(msg);
  };

  const http = server.httpServer;
  if (!http) return;

  if (discoveryHttpServer && discoveryHttpServer !== http) {
    stopDiscovery();
  }

  const start = () => {
    if (discoverySocket) return;

    let bound = false;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const onMessage = (msg, rinfo) => {
      if (!bound) return;
      const text = msg.toString('utf8').trim();
      if (!text.startsWith(DISCOVERY_PROBE_PREFIX)) return;

      const matchedIp = pickMatchedIp(rinfo.address);
      if (!matchedIp) return;

      const vitePort = resolveVitePort(server);
      const reply = `${DISCOVERY_REPLY_PREFIX}http://${matchedIp}:${vitePort}`;
      socket.send(reply, rinfo.port, rinfo.address, (err) => {
        if (err) log(`[setup-discovery] reply failed: ${err.message}`);
      });
    };

    const onError = (err) => {
      if (err?.code === 'EADDRINUSE') {
        log('[setup-discovery] port 50505 in use — responder not started');
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        return;
      }
      log(`[setup-discovery] socket error: ${err?.message || err}`);
    };

    socket.on('message', onMessage);
    socket.on('error', onError);

    try {
      socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
        bound = true;
        discoverySocket = socket;
        try {
          socket.setBroadcast(true);
        } catch {
          /* optional on responder */
        }
        log('setup discovery responder listening on udp/50505');
      });
    } catch (err) {
      log(`[setup-discovery] bind failed: ${err?.message || err}`);
    }
  };

  discoveryHttpServer = http;

  if (http.listening) {
    start();
  } else {
    http.once('listening', start);
  }

  http.once('close', stopDiscovery);
}
