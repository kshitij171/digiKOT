import { Server } from 'socket.io';
import { verifySession, getCookieName } from '../middleware/auth.js';
import { appendDevLog, isDevDiagnosticsEnabled } from '../lib/devDiagnostics.js';

/** @type {Server | null} */
let io = null;

export function attachSocketIo(httpServer, { corsOrigin = true, sessionSecret } = {}) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || '';
      const match = cookieHeader.match(new RegExp(`${getCookieName()}=([^;]+)`));
      const fromCookie = match?.[1] ? decodeURIComponent(match[1]) : null;
      const fromAuth = socket.handshake.auth?.token || socket.handshake.query?.token;
      const token = fromCookie || fromAuth;
      if (!token) return next(new Error('Unauthorized'));
      const user = await verifySession(String(token), sessionSecret);
      socket.data.user = user;
      socket.join(`role:${user.role}`);
      socket.join(`user:${user.userId}`);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('system:hello', { t: Date.now(), userId: socket.data.user?.userId });
    if (isDevDiagnosticsEnabled()) {
      appendDevLog({
        layer: 'server',
        event: 'socket.connect',
        userId: socket.data.user?.userId || null,
        role: socket.data.user?.role || null,
        meta: { socketClients: io.engine?.clientsCount ?? 0 },
      });
    }
    socket.on('disconnect', () => {
      if (isDevDiagnosticsEnabled()) {
        appendDevLog({
          layer: 'server',
          event: 'socket.disconnect',
          userId: socket.data.user?.userId || null,
          role: socket.data.user?.role || null,
          meta: { socketClients: io.engine?.clientsCount ?? 0 },
        });
      }
    });
  });

  return io;
}

export function getIo() {
  return io;
}

export function emitDomainEvent(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

export function getSocketStats() {
  if (!io) return { connected: false, connectedClients: 0 };
  return {
    connected: true,
    connectedClients: io.engine?.clientsCount ?? 0,
  };
}
