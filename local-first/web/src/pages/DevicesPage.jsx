import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client.js';

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastTest, setLastTest] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet('/api/devices');
      setDevices(r.devices || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function sendTest(deviceId) {
    setError(null);
    setLastTest(null);
    try {
      const r = await apiPost('/api/devices/test-notification', { deviceId });
      setLastTest(r);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>Devices</h1>
      <p>
        Test path: enqueue <code>notifications</code> + <code>mqtt_outbox</code> → worker → MQTT (
        topic <code>kot/v1/default/kitchen/events</code>).
      </p>
      <button type="button" onClick={load} disabled={loading}>
        Refresh
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {loading && <p>Loading…</p>}
      <ul>
        {devices.map((d) => (
          <li key={d.id}>
            <strong>{d.device_id}</strong> — {d.device_name} ({d.mqtt_username}){' '}
            <button type="button" onClick={() => sendTest(d.device_id)}>
                Test notification
              </button>
          </li>
        ))}
      </ul>
      {lastTest && (
        <div>
          <h2>Last test result</h2>
          <pre>{JSON.stringify(lastTest, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
