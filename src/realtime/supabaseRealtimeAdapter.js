import { supabase } from '../lib/db/supabaseClient';

export function createSupabaseRealtimeAdapter() {
  return {
    subscribe({ channelName, table, filter, onEvent, onStatus }) {
      // Append a unique suffix so each subscription gets its own channel.
      // This prevents collisions when multiple components subscribe to the
      // same logical channel (e.g. Strict Mode double-mount, or two components
      // that both watch the same table).
      const uniqueName = `${channelName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const channel = supabase
        .channel(uniqueName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter },
          (payload) => onEvent?.(payload)
        )
        .subscribe((status) => {
          onStatus?.(status);
        });

      return () => {
        supabase.removeChannel(channel);
      };
    },
  };
}
