import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { managerService } from '../services/managerService';
import { roleDisplayLabel } from '../lib/utils/auth';
import './ManagerApp.css';

export default function PagerRegisterPage() {
  const { currentUser, logoutUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ deviceCode: '', macAddress: '', label: '' });

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setErr('');
    try {
      const data = await managerService.listPagerDashboard({ managerUser: currentUser });
      setRows(data.rows || []);
    } catch (e) {
      setErr(e.message || 'Unable to load devices.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const submitRegister = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setSaving(true);
    try {
      await managerService.registerPagerDevice({
        managerUser: currentUser,
        deviceCode: form.deviceCode,
        macAddress: form.macAddress,
        label: form.label,
      });
      setMsg('Pager device registered.');
      setForm({ deviceCode: '', macAddress: '', label: '' });
      await load();
    } catch (e2) {
      setErr(e2.message || 'Unable to register device.');
    } finally {
      setSaving(false);
    }
  };

  const copyMac = async (mac) => {
    try {
      await navigator.clipboard.writeText(mac);
      setMsg(`Copied MAC ${mac}`);
    } catch {
      setErr('Could not copy to clipboard.');
    }
  };

  const deleteDevice = async (deviceCode) => {
    if (!window.confirm(`Delete device ${deviceCode}?`)) return;
    setMsg('');
    setErr('');
    try {
      await managerService.deletePagerDeviceIfUnassigned({
        managerUser: currentUser,
        deviceCode,
      });
      setMsg('Device deleted.');
      await load();
    } catch (e) {
      setErr(e.message || 'Unable to delete device.');
    }
  };

  return (
    <div className="mgr-shell">
      <header className="mgr-topbar">
        <div className="mgr-topbar-user">
          <div className="mgr-topbar-user-text">
            <span className="mgr-topbar-user-label">{roleDisplayLabel(currentUser?.role)}</span>
            <span className="mgr-topbar-user-name">@{currentUser?.username || currentUser?.name}</span>
          </div>
          <button type="button" className="mgr-logout-btn mgr-logout-mobile" onClick={logoutUser}>
            Log out
          </button>
        </div>
        <div className="mgr-topbar-brand-block">
          <div className="mgr-topbar-brand">OPULENCE</div>
          <div className="mgr-topbar-sub">Pager device provisioning</div>
        </div>
        <div className="mgr-topbar-actions">
          <Link to="/manager" className="mgr-logout-btn mgr-logout-desktop" style={{ textDecoration: 'none' }}>
            ← Manager
          </Link>
          <button type="button" className="mgr-logout-btn mgr-logout-desktop" onClick={logoutUser}>
            Log out
          </button>
        </div>
      </header>

      <div className="mgr-content">
        <h2 className="mgr-section-h">Register pager devices</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          Provision ESP pagers here, then assign them to waiters on the Manager → Pagers tab.
        </p>

        {err && <p className="staff-error-msg">{err}</p>}
        {msg && <p className="staff-message">{msg}</p>}

        <div className="staff-section">
          <div className="staff-section-title">New device</div>
          <form onSubmit={submitRegister} className="staff-form">
            <div className="staff-field">
              <label>Device code *</label>
              <input
                className="staff-input"
                placeholder="e.g. pager_12"
                value={form.deviceCode}
                onChange={(e) => setForm((p) => ({ ...p, deviceCode: e.target.value.toLowerCase() }))}
                required
              />
            </div>
            <div className="staff-field">
              <label>MAC address *</label>
              <input
                className="staff-input"
                placeholder="AA:BB:CC:DD:EE:FF"
                value={form.macAddress}
                onChange={(e) => setForm((p) => ({ ...p, macAddress: e.target.value.toUpperCase() }))}
                required
              />
            </div>
            <div className="staff-field">
              <label>Label (optional)</label>
              <input
                className="staff-input"
                placeholder="Pager 12"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
            <button type="submit" className="staff-submit-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Register device'}
            </button>
          </form>
        </div>

        <div className="staff-section">
          <div className="staff-section-title">Registered devices</div>
          {loading ? (
            <p>Loading…</p>
          ) : rows.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No devices registered yet.</p>
          ) : (
            <div className="staff-table-wrap">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Code</th>
                    <th>MAC</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const assigned = Boolean(row.assignment);
                    return (
                      <tr key={row.device_code}>
                        <td>{row.label || '—'}</td>
                        <td><code>{row.device_code}</code></td>
                        <td>
                          <code>{row.mac_address}</code>
                          <button
                            type="button"
                            className="mgr-logout-btn"
                            style={{ marginLeft: '0.5rem' }}
                            onClick={() => copyMac(row.mac_address)}
                          >
                            Copy
                          </button>
                        </td>
                        <td>
                          {!row.active
                            ? 'Inactive'
                            : assigned
                              ? `Assigned to ${row.waiter?.name || row.waiter?.username || 'waiter'}`
                              : 'Available'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="staff-delete-btn"
                            disabled={assigned}
                            title={assigned ? 'Unassign before deleting' : 'Delete device'}
                            onClick={() => deleteDevice(row.device_code)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
