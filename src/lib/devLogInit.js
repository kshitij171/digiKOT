import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { devLog, initDevLogSession, isDevLogEnabled } from './devLog.js';

function installGlobalHandlers() {
  window.addEventListener('error', (event) => {
    devLog('client.error', {
      message: event.message,
      stack: event.error?.stack,
      meta: { source: 'window.onerror', filename: event.filename, line: event.lineno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    devLog('client.error', {
      message: reason?.message || String(reason),
      stack: reason?.stack,
      meta: { source: 'unhandledrejection' },
    });
  });
}

export function DevLogRouteWatcher() {
  const location = useLocation();

  useEffect(() => {
    devLog('ui.route', { meta: { path: location.pathname } });
  }, [location.pathname]);

  return null;
}

export function initDevLog() {
  if (!isDevLogEnabled()) return;
  initDevLogSession();
  installGlobalHandlers();
}
