export function createPollingRealtimeAdapter() {
  return {
    subscribe({ onEvent, pollMs = 500, onStatus }) {
      onStatus?.('SUBSCRIBED');
      const timer = setInterval(() => onEvent?.(), pollMs);
      return () => {
        clearInterval(timer);
        onStatus?.('CLOSED');
      };
    },
  };
}
