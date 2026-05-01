import { Server } from 'socket.io';

/** @type {Server | null} */
let io = null;

export function attachSocketIo(httpServer, { corsOrigin = true } = {}) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.on('connection', (socket) => {
    socket.emit('system:hello', { t: Date.now() });
  });

  return io;
}

export function getSocketStats() {
  if (!io) {
    return { connected: false, connectedClients: 0, socketCount: 0 };
  }
  return {
    connected: true,
    connectedClients: io.engine?.clientsCount ?? 0,
    socketCount: io.sockets?.sockets?.size ?? 0,
  };
}
