import { createSocketIoRealtimeAdapter } from './socketIoRealtimeAdapter';
import { createPollingRealtimeAdapter } from './pollingRealtimeAdapter';

const mode = import.meta.env.VITE_REALTIME_MODE || 'socketio';

export const realtimeAdapter =
  mode === 'polling' ? createPollingRealtimeAdapter() : createSocketIoRealtimeAdapter();
