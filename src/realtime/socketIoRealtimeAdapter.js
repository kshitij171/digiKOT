import { io } from 'socket.io-client';
import { devLog } from '../lib/devLog.js';
import { getSessionToken } from '../lib/api/apiClient.js';

let socket = null;
const handlers = new Map();

function ensureSocket() {
  if (socket?.connected) return socket;
  // Recreate if an older unauthenticated socket exists
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socket = io({
    path: '/socket.io',
    withCredentials: true,
    // Bearer token for LAN devices where cookies may not stick through the Vite proxy
    auth: { token: getSessionToken() || undefined },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    for (const [, entry] of handlers) {
      entry.onResync?.();
      entry.onStatus?.('SUBSCRIBED');
    }
  });

  socket.on('disconnect', () => {
    for (const [, entry] of handlers) {
      entry.onStatus?.('CLOSED');
    }
  });

  const domainEvents = [
    'kots:updated', 'tables:updated', 'menu:updated', 'notifications:updated',
    'cancel_requests:updated', 'audit:updated', 'bill_modifications:updated',
  ];
  for (const ev of domainEvents) {
    socket.on(ev, () => {
      devLog('realtime.event', { meta: { event: ev } });
      for (const [, entry] of handlers) {
        entry.handler?.({ eventType: '*', new: {} });
      }
    });
  }

  return socket;
}

export function createSocketIoRealtimeAdapter() {
  return {
    subscribe({ channelName, table, filter, onData, onEvent, onStatus }) {
      ensureSocket();
      const key = channelName || `${table}:${filter || 'all'}`;
      const handler = onData || onEvent;
      const entry = { handler, onResync: handler, onStatus };
      handlers.set(key, entry);
      if (socket?.connected) {
        onStatus?.('SUBSCRIBED');
      }
      return () => handlers.delete(key);
    },
  };
}
