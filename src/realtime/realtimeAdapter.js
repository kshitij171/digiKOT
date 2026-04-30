import { createSupabaseRealtimeAdapter } from './supabaseRealtimeAdapter';
import { createPollingRealtimeAdapter } from './pollingRealtimeAdapter';

const mode = import.meta.env.VITE_REALTIME_MODE || 'supabase';

export const realtimeAdapter =
  mode === 'polling' ? createPollingRealtimeAdapter() : createSupabaseRealtimeAdapter();
