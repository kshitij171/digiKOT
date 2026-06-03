const UNHEALTHY = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

/**
 * Creates a subscription controller that loads data initially and then reloads on
 * realtime events, with debounce and optional polling fallback when channels are unhealthy.
 * @param {object} args
 * @param {() => Promise<void>} args.load - Loader invoked on start and on reload triggers.
 * @param {Array<(onEvent: () => void, onStatus: (status: string) => void) => (() => void)>} args.subscribeFns
 *   Functions that set up subscriptions and return cleanup functions.
 * @param {number} [args.debounceMs=60] - Debounce window for bursty events.
 * @param {number} [args.fallbackMs=500] - Polling interval when channel is unhealthy.
 * @returns {() => void} Cleanup function to unsubscribe and stop timers.
 */
export function createSubscriptionController({
  load,
  subscribeFns,
  debounceMs = 60,
  fallbackMs = 500,
}) {
  let fallbackTimer = null;
  let debounceTimer = null;
  let lastStatus = null;

  const safeLoad = () =>
    load().catch((err) => console.warn('[subscription load error]', err?.message || err));

  const stopFallback = () => {
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const startFallback = () => {
    if (fallbackTimer) return;
    fallbackTimer = setInterval(safeLoad, fallbackMs);
  };

  const debouncedLoad = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(safeLoad, debounceMs);
  };

  const handleStatus = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === lastStatus) return;
    lastStatus = normalized;
    if (normalized === 'SUBSCRIBED') {
      stopFallback();
      safeLoad();
      return;
    }
    if (UNHEALTHY.has(normalized)) {
      startFallback();
    }
  };

  const unsubs = subscribeFns.map((subscribe) => subscribe(debouncedLoad, handleStatus));
  safeLoad();

  return () => {
    stopFallback();
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubs.forEach((u) => u?.());
  };
}
