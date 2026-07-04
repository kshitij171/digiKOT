import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { managerService } from '../services/managerService';
import { hasManagerAccess } from '../lib/utils/auth';
import './ManagerApp.css';

export default function PagerRegisterPage() {
  const { currentUser, logoutUser } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState({ rows: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingCode, setDeletingCode] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [macRaw, setMacRaw] = useState('');
  const [deviceCode, setDeviceCode] = useState('');
  const [label, setLabel] = useState('');
  const [copyDoneId, setCopyDoneId] = useState(null);

  const load = useCallback(async () => {
    if (!currentUser || !hasManagerAccess(currentUser.role)) return;
    setLoading(true);
    setErr('');
    try {
      const data = await managerService.listPagerDashboard({ managerUser: currentUser });
      setDashboard(data);
    } catch (e) {
      setErr(e.message || 'Unable to load devices.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (!deviceCode.trim() || !macRaw.trim()) {
      setErr('Enter device code and MAC.');
      return;
    }
    setSaving(true);
    try {
      await managerService.registerPagerDevice({
        managerUser: currentUser,
        deviceCode,
        macAddress: macRaw,
        label,
      });
      setMsg('Pager registered.');
      setMacRaw('');
      setDeviceCode('');
      setLabel('');
      await load();
    } catch (e) {
      setErr(e.message || 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  const copyMac = async (mac, rowKey) => {
    try {
      await navigator.clipboard.writeText(mac);
      setCopyDoneId(rowKey);
      setTimeout(() => setCopyDoneId(null), 1500);
    } catch {
      setErr('Could not copy to clipboard.');
    }
  };

  const doDelete = async (code) => {
    setMsg('');
    setErr('');
    setDeletingCode(code);
    try {
      await managerService.deletePagerDeviceIfUnassigned({ managerUser: currentUser, deviceCode: code });
      setMsg('Device removed from inventory.');
      await load();
    } catch (e) {
      setErr(e.message || 'Delete failed.');
    } finally {
      setDeletingCode(null);
    }
  };

  if (!hasManagerAccess(currentUser.role)) {
    return (
      <div className="mgr-shell">
        <div className="mgr-content" style={{ maxWidth: 480 }}>
          <p className="staff-error-msg">Manager or owner access only.</p>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Log in with a manager or owner PIN to register pager devices.
          </p>
          <Link to={authService.getRouteForRole(currentUser.role)} style={{ color: '#c9a84c' }}>
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mgr-shell">
      <div className="mgr-topbar">
        <div>
          <div className="mgr-topbar-brand">Pager device setup</div>
          <div className="mgr-topbar-sub">Provision MAC + device_code for ESP units</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/manager" className="mgr-tab" style={{ textDecoration: 'none', border: '1px solid #334155' }}>
            Manager dashboard
          </Link>
          <div className="mgr-topbar-user">@{currentUser?.username || currentUser?.name}</div>
          <button
            type="button"
            onClick={() => {
              logoutUser();
              navigate('/login');
            }}
            style={{
              padding: '0.3rem 0.75rem',
              background: 'transparent',
              border: '1px solid #334155',
              color: '#94a3b8',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontFamily: 'inherit',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="mgr-content">
        <p className="mgr-section-h">
          Register as many pagers as you need. Each row is one physical device (unique <code>device_code</code> + MAC).
          Flash firmware to subscribe to <code>kot/pager/&lt;device_code&gt;/notify</code>. MAC and device code cannot be edited after creation.
        </p>

        {err && <p className="staff-error-msg">{err}</p>}
        {msg && <p className="staff-message">{msg}</p>}

        <div className="staff-section">
          <div className="staff-section-title">Register pager</div>
          <form onSubmit={submit} className="staff-form">
            <div className="staff-field">
              <label>Device code *</label>
              <input
                className="staff-input"
                placeholder="e.g. pager_7, floor2_a"
                value={deviceCode}
                onChange={(e) => setDeviceCode(e.target.value)}
                disabled={saving}
                autoComplete="off"
                spellCheck={false}
              />
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                Lowercase letters, numbers, underscores; must start with a letter (max 64 characters). Must match firmware <code>DEVICE_CODE</code>.
              </p>
            </div>
            <div className="staff-field">
              <label>Label (optional)</label>
              <input
                className="staff-input"
                placeholder="Shown in manager tables — auto from code if empty"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="staff-field">
              <label>MAC address *</label>
              <input
                className="staff-input"
                placeholder="AA:BB:CC:DD:EE:FF"
                value={macRaw}
                onChange={(e) => setMacRaw(e.target.value)}
                disabled={saving}
                autoComplete="off"
              />
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                Get MAC from ESP using Serial Monitor (WiFi.macAddress()).
              </p>
            </div>
            <button type="submit" className="btn-staff-submit" disabled={saving}>
              {saving ? 'Saving…' : 'Register pager'}
            </button>
          </form>
        </div>

        <div className="staff-section">
          <div className="staff-section-title">Registered devices</div>
          {loading ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading…</p>
          ) : dashboard.rows.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>No pager devices registered yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>device_code</th>
                    <th>Label</th>
                    <th>MAC</th>
                    <th />
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rows.map((r) => (
                    <tr key={r.device_code}>
                      <td>
                        <code style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.device_code}</code>
                      </td>
                      <td>{r.label}</td>
                      <td>
                        <code style={{ fontSize: '0.78rem' }}>{r.mac_address}</code>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-reactivate"
                          style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                          onClick={() => copyMac(r.mac_address, r.device_code)}
                        >
                          {copyDoneId === r.device_code ? 'Copied' : 'Copy MAC'}
                        </button>
                      </td>
                      <td>{r.waiter ? <span style={{ color: '#f59e0b' }}>Assigned</span> : <span style={{ color: '#22c55e' }}>Available</span>}</td>
                      <td>
                        {!r.waiter ? (
                          <button
                            type="button"
                            className="btn-deactivate"
                            style={{ fontSize: '0.72rem' }}
                            disabled={deletingCode === r.device_code}
                            onClick={() => doDelete(r.device_code)}
                          >
                            {deletingCode === r.device_code ? 'Removing…' : 'Delete'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
