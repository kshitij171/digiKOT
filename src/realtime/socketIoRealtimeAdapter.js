import { io } from 'socket.io-client';

let socket = null;
const handlers = new Map();

function ensureSocket() {
  if (socket?.connected) return socket;
  socket = io({
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    for (const [, entry] of handlers) {
      entry.onResync?.();
    }
  });

  const domainEvents = [
    'kots:updated', 'tables:updated', 'menu:updated', 'notifications:updated',
    'cancel_requests:updated', 'audit:updated', 'bill_modifications:updated',
  ];
  for (const ev of domainEvents) {
    socket.on(ev, () => {
      for (const [, entry] of handlers) {
        entry.handler?.({ eventType: '*', new: {} });
      }
    });
  }

  return socket;
}

export function createSocketIoRealtimeAdapter() {
  return {
    subscribe({ channelName, table, filter, onData }) {
      ensureSocket();
      const key = channelName || `${table}:${filter || 'all'}`;
      const entry = { handler: onData, onResync: onData };
      handlers.set(key, entry);
      return () => handlers.delete(key);
    },
  };
}
