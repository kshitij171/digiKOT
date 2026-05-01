import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { createSocket } from '../socket/client.js';

export default function LocalHealthPage() {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [socketMsg, setSocketMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiGet('/api/system/status');
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setErr(String(e.message));
      }
    })();
    const t = setInterval(async () => {
      try {
        const s = await apiGet('/api/system/status');
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setErr(String(e.message));
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const socket = createSocket();
    socket.on('system:hello', (p) => setSocketMsg(p));
    return () => socket.close();
  }, []);

  return (
    <div>
      <h1>Local health</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
      {status && <pre>{JSON.stringify(status, null, 2)}</pre>}
      <p>
        Socket sample: <code>{socketMsg ? JSON.stringify(socketMsg) : '…'}</code>
      </p>
    </div>
  );
}
