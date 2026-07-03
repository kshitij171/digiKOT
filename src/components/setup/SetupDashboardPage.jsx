import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setupService } from '../../services/setupService';
import './SetupApp.css';

function fmtSeen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function guessLanIp() {
  const host = window.location.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  return '';
}

export default function SetupDashboardPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [wifiMeta, setWifiMeta] = useState({ saved: false, ssid: '', mqttHost: '', mqttPort: 1883 });
  const [wifiForm, setWifiForm] = useState({
    ssid: '',
    password: '',
    mqttHost: guessLanIp(),
    mqttPort: '1883',
  });
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const load = useCallback(async ({ manual = false } = {}) => {
    if (manual) setRefreshing(true);
    try {
      const data = await setupService.listDevices();
      setDevices(data.devices || []);
      setWifiMeta((prev) => ({
        saved: data.restaurant_wifi_saved,
        ssid: data.restaurant_ssid || '',
        mqttHost: data.mqtt_host || prev.mqttHost,
        mqttPort: data.mqtt_port || 1883,
      }));
      if (data.mqtt_host) {
        setWifiForm((p) => (p.mqttHost ? p : { ...p, mqttHost: data.mqtt_host }));
      }
      setLastRefreshedAt(new Date());
      setErr('');
    } catch (e) {
      if (String(e.message).includes('401') || e.message.includes('token')) {
        setupService.clearToken();
        navigate('/setup', { replace: true });
        return;
      }
      setErr(e.message || 'Failed to load devices');
    } finally {
      if (manual) setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!setupService.getToken()) {
      navigate('/setup', { replace: true });
      return;
    }
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load, navigate]);

  const counts = useMemo(() => {
    const onRoot = devices.filter((d) => d.provision_state === 'on_root').length;
    const mqttOk = devices.filter((d) => d.provision_state === 'mqtt_ok').length;
    return { onRoot, mqttOk };
  }, [devices]);

  const logout = () => {
    setupService.clearToken();
    navigate('/setup', { replace: true });
  };

  const saveWifi = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await setupService.saveRestaurantWifi({
        ssid: wifiForm.ssid,
        password: wifiForm.password,
        mqttHost: wifiForm.mqttHost,
        mqttPort: Number(wifiForm.mqttPort) || 1883,
      });
      setMsg('Restaurant Wi-Fi config saved.');
      setWifiForm((p) => ({ ...p, password: '' }));
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pushAll = async () => {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const r = await setupService.pushAll();
      setMsg(`Queued push for ${r.queued} pager(s).`);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (fn) => {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (mac) => {
    const edit = edits[mac];
    if (!edit) return;
    await runAction(async () => {
      await setupService.patchDevice(mac, {
        deviceCode: edit.device_code,
        label: edit.label,
      });
      setEdits((p) => {
        const next = { ...p };
        delete next[mac];
        return next;
      });
      setMsg('Device label updated.');
    });
  };

  return (
    <div className="setup-screen">
      <div className="setup-topbar">
        <div>
          <h1>
            Install Setup
            <span className="setup-badge">ROOT provisioning</span>
          </h1>
        </div>
        <div className="setup-counts">
          <strong>{counts.onRoot}</strong> on ROOT · <strong>{counts.mqttOk}</strong> mqtt_ok
        </div>
        <button type="button" className="setup-btn setup-btn-secondary" style={{ width: 'auto' }} onClick={logout}>
          Logout
        </button>
      </div>

      {err && <p className="setup-error">{err}</p>}
      {msg && <div className="setup-toast">{msg}</div>}

      <section className="setup-section">
        <h2>Prerequisites</h2>
        <ul className="setup-checklist">
          <li>digiKOT server running (<code>npm run dev:all</code> or <code>npm run start</code>)</li>
          <li>Embedded MQTT on port 1883 (started with the server)</li>
          <li>ROOT router powered, SSID <code>DigiKOT-ROOT</code></li>
          <li>Recommended: laptop Ethernet → ROOT + Wi-Fi → restaurant (dual-home)</li>
        </ul>
      </section>

      <section className="setup-section">
        <h2>Restaurant network</h2>
        {wifiMeta.saved && (
          <p className="setup-helper" style={{ marginBottom: '0.75rem' }}>
            Saved: SSID <strong>{wifiMeta.ssid}</strong> · MQTT {wifiMeta.mqttHost}:{wifiMeta.mqttPort}
            {' '}(password not shown)
          </p>
        )}
        <form className="setup-form-grid" onSubmit={saveWifi}>
          <div className="setup-field">
            <label>Restaurant Wi-Fi SSID</label>
            <input
              value={wifiForm.ssid}
              onChange={(e) => setWifiForm((p) => ({ ...p, ssid: e.target.value }))}
              required
            />
          </div>
          <div className="setup-field">
            <label>Restaurant Wi-Fi password</label>
            <input
              type="password"
              value={wifiForm.password}
              onChange={(e) => setWifiForm((p) => ({ ...p, password: e.target.value }))}
              placeholder={wifiMeta.saved ? '(unchanged if empty)' : ''}
            />
          </div>
          <div className="setup-field">
            <label>Server / MQTT host</label>
            <input
              value={wifiForm.mqttHost}
              onChange={(e) => setWifiForm((p) => ({ ...p, mqttHost: e.target.value }))}
              required
            />
            <p className="setup-helper">IP of this laptop on restaurant Wi-Fi — not the ROOT IP (192.168.50.x)</p>
          </div>
          <div className="setup-field">
            <label>MQTT port</label>
            <input
              value={wifiForm.mqttPort}
              onChange={(e) => setWifiForm((p) => ({ ...p, mqttPort: e.target.value }))}
            />
          </div>
          <div className="setup-field" style={{ alignSelf: 'end' }}>
            <button type="submit" className="setup-btn" disabled={busy}>
              Save config
            </button>
          </div>
        </form>
      </section>

      <section className="setup-section">
        <h2>Pagers on ROOT</h2>
        {devices.length === 0 ? (
          <p className="setup-empty">
            No pagers detected. Power ESPs on ROOT router <code>DigiKOT-ROOT</code>; firmware must be flashed at workplace.
          </p>
        ) : (
          <div className="setup-table-wrap">
            <table className="setup-table">
              <thead>
                <tr>
                  <th>MAC</th>
                  <th>Device code</th>
                  <th>Label</th>
                  <th>IP</th>
                  <th>FW</th>
                  <th>Last seen</th>
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const edit = edits[d.mac_address] || { device_code: d.device_code, label: d.label };
                  return (
                    <tr key={d.mac_address}>
                      <td><code>{d.mac_address}</code></td>
                      <td>
                        <input
                          className="setup-inline-input"
                          value={edit.device_code}
                          onChange={(e) =>
                            setEdits((p) => ({
                              ...p,
                              [d.mac_address]: { ...edit, device_code: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="setup-inline-input"
                          style={{ width: '9rem' }}
                          value={edit.label}
                          onChange={(e) =>
                            setEdits((p) => ({
                              ...p,
                              [d.mac_address]: { ...edit, label: e.target.value },
                            }))
                          }
                        />
                        {(edit.device_code !== d.device_code || edit.label !== d.label) && (
                          <button type="button" onClick={() => saveEdit(d.mac_address)} disabled={busy}>
                            Save
                          </button>
                        )}
                      </td>
                      <td>{d.last_ip || '—'}</td>
                      <td>{d.firmware_version || '—'}</td>
                      <td>{fmtSeen(d.last_seen_at)}</td>
                      <td>
                        <span className={`setup-state setup-state-${d.provision_state}`}>
                          {d.provision_state}
                        </span>
                      </td>
                      <td>
                        <div className="setup-row-actions">
                          <button
                            type="button"
                            disabled={busy || d.provision_state !== 'on_root'}
                            onClick={() => runAction(() => setupService.pushOne(d.mac_address))}
                          >
                            Push
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runAction(() => setupService.forgetWifi(d.mac_address))}
                          >
                            Forget
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction(async () => {
                                await setupService.testBeep(d.mac_address);
                                setMsg(`Test beep sent to ${d.device_code}.`);
                              })
                            }
                          >
                            Test beep
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="setup-btn"
            style={{ width: 'auto' }}
            disabled={busy || !wifiMeta.saved || counts.onRoot === 0}
            onClick={pushAll}
          >
            Push restaurant Wi-Fi to all on ROOT
          </button>
          <button
            type="button"
            className="setup-btn setup-btn-secondary"
            style={{ width: 'auto' }}
            disabled={busy || refreshing}
            onClick={() => load({ manual: true })}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {lastRefreshedAt && (
            <span className="setup-helper" style={{ margin: 0 }}>
              Updated {fmtSeen(lastRefreshedAt.toISOString())}
              {refreshing ? ' · loading…' : ''}
            </span>
          )}
        </div>
      </section>

      <section className="setup-section">
        <h2>After install</h2>
        <p className="setup-info">
          When all pagers show <code>mqtt_ok</code>, open <Link to="/login">Manager → Pagers</Link> to assign waiters.
          Verify OLEDs show each <code>device_code</code> on ROOT; use Test beep to match physical units before push.
        </p>
      </section>
    </div>
  );
}
