const UNHEALTHY = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function createSubscriptionController({
  load,
  subscribeFns,
  debounceMs = 60,
  fallbackMs = 500,
}) {
  let fallbackTimer = null;
  let debounceTimer = null;
  let lastStatus = null;

  const stopFallback = () => {
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const startFallback = () => {
    if (fallbackTimer) return;
    fallbackTimer = setInterval(() => {
      load();
    }, fallbackMs);
  };

  const debouncedLoad = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      load();
    }, debounceMs);
  };

  const handleStatus = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === lastStatus) return;
    lastStatus = normalized;
    if (normalized === 'SUBSCRIBED') {
      stopFallback();
      load();
      return;
    }
    if (UNHEALTHY.has(normalized)) {
      startFallback();
    }
  };

  const unsubs = subscribeFns.map((subscribe) => subscribe(debouncedLoad, handleStatus));
  load();

  return () => {
    stopFallback();
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubs.forEach((u) => u?.());
  };
}
