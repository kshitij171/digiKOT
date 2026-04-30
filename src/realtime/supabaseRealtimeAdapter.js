import { supabase } from '../lib/db/supabaseClient';

export function createSupabaseRealtimeAdapter() {
  return {
    subscribe({ channelName, table, filter, onEvent, onStatus }) {
      const channel = supabase
        .channel(channelName)
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
