import React, { useEffect, useState } from 'react';
import { auditService } from '../services/auditService';
import { managerService } from '../services/managerService';
import { useAuth } from '../context/AuthContext';
import { validatePin } from '../lib/utils/auth';

export default function ManagerApp() {
  const { currentUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [staffMessage, setStaffMessage] = useState('');
  const [staffError, setStaffError] = useState('');
  const [staffSaving, setStaffSaving] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [form, setForm] = useState({
    tableNumber: '',
    kotItemId: '',
    waiterUserId: '',
    reason: '',
  });
  const [staffForm, setStaffForm] = useState({
    name: '',
    phone: '',
    role: 'waiter',
    pin: '',
    confirmPin: '',
  });
  const [pinResetForm, setPinResetForm] = useState({
    phone: '',
    role: 'waiter',
    newPin: '',
    confirmPin: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => auditService.subscribeRecent(setLogs), []);
  useEffect(() => {
    if (!currentUser) return;
    const load = async () => {
      setLoadingStaff(true);
      try {
        const rows = await managerService.listStaff({ managerUser: currentUser });
        setStaff(rows);
      } catch (err) {
        setStaffError(err.message || 'Unable to load staff.');
      } finally {
        setLoadingStaff(false);
      }
    };
    load();
  }, [currentUser]);

  const submitAdjustment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await managerService.createPostPrepAdjustment({
        managerUserId: currentUser?.id || 'manager',
        waiterUserId: form.waiterUserId,
        tableNumber: Number(form.tableNumber),
        kotItemId: form.kotItemId,
        reason: form.reason,
      });
      setForm({ tableNumber: '', kotItemId: '', waiterUserId: '', reason: '' });
    } finally {
      setSaving(false);
    }
  };

  const refreshStaff = async () => {
    if (!currentUser) return;
    const rows = await managerService.listStaff({ managerUser: currentUser });
    setStaff(rows);
  };

  const submitStaffRegistration = async (e) => {
    e.preventDefault();
    setStaffMessage('');
    setStaffError('');
    if (!validatePin(staffForm.pin)) {
      setStaffError('PIN must be 4-6 digits.');
      return;
    }
    if (staffForm.pin !== staffForm.confirmPin) {
      setStaffError('PIN and confirm PIN must match.');
      return;
    }
    setStaffSaving(true);
    try {
      const created = await managerService.registerStaff({
        managerUser: currentUser,
        name: staffForm.name,
        phone: staffForm.phone,
        role: staffForm.role,
        pin: staffForm.pin,
      });
      setStaffMessage(`Staff created. Generated code: ${created.code}`);
      setStaffForm({ name: '', phone: '', role: 'waiter', pin: '', confirmPin: '' });
      await refreshStaff();
    } catch (err) {
      setStaffError(err.message || 'Unable to create staff.');
    } finally {
      setStaffSaving(false);
    }
  };

  const submitPinReset = async (e) => {
    e.preventDefault();
    setStaffMessage('');
    setStaffError('');
    if (!validatePin(pinResetForm.newPin)) {
      setStaffError('New PIN must be 4-6 digits.');
      return;
    }
    if (pinResetForm.newPin !== pinResetForm.confirmPin) {
      setStaffError('New PIN and confirm PIN must match.');
      return;
    }
    setResetSaving(true);
    try {
      await managerService.resetStaffPin({
        managerUser: currentUser,
        phone: pinResetForm.phone,
        role: pinResetForm.role,
        newPin: pinResetForm.newPin,
      });
      setStaffMessage('PIN reset successful.');
      setPinResetForm((prev) => ({ ...prev, newPin: '', confirmPin: '' }));
      await refreshStaff();
    } catch (err) {
      setStaffError(err.message || 'Unable to reset PIN.');
    } finally {
      setResetSaving(false);
    }
  };

  const setUserActive = async (userId, active) => {
    setStaffMessage('');
    setStaffError('');
    try {
      if (active) {
        await managerService.reactivateStaff({ managerUser: currentUser, userId });
        setStaffMessage('Staff reactivated.');
      } else {
        await managerService.deactivateStaff({ managerUser: currentUser, userId });
        setStaffMessage('Staff deactivated.');
      }
      await refreshStaff();
    } catch (err) {
      setStaffError(err.message || 'Unable to update staff status.');
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Manager Audit Feed</h2>
      <section style={{ marginBottom: '1rem', border: '1px solid #334155', borderRadius: 8, padding: '0.75rem' }}>
        <h3>Staff Management</h3>
        {staffError ? <div className="login-error">{staffError}</div> : null}
        {staffMessage ? <div style={{ color: '#10b981', marginBottom: '0.5rem' }}>{staffMessage}</div> : null}

        <form onSubmit={submitStaffRegistration} style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
          <h4>Add Staff</h4>
          <input
            placeholder="Name"
            value={staffForm.name}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            placeholder="Phone"
            value={staffForm.phone}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, phone: e.target.value }))}
            required
          />
          <select
            value={staffForm.role}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            <option value="waiter">Waiter</option>
            <option value="captain">Captain</option>
            <option value="kitchen_supervisor">Kitchen Supervisor</option>
            <option value="manager">Manager</option>
          </select>
          <input
            type="password"
            placeholder="PIN (4-6 digits)"
            value={staffForm.pin}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, pin: e.target.value }))}
            required
          />
          <input
            type="password"
            placeholder="Confirm PIN"
            value={staffForm.confirmPin}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, confirmPin: e.target.value }))}
            required
          />
          <button type="submit" disabled={staffSaving}>{staffSaving ? 'Creating...' : 'Create Staff'}</button>
        </form>

        <form onSubmit={submitPinReset} style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
          <h4>Reset PIN</h4>
          <input
            placeholder="Phone"
            value={pinResetForm.phone}
            onChange={(e) => setPinResetForm((prev) => ({ ...prev, phone: e.target.value }))}
            required
          />
          <select
            value={pinResetForm.role}
            onChange={(e) => setPinResetForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            <option value="waiter">Waiter</option>
            <option value="captain">Captain</option>
            <option value="kitchen_supervisor">Kitchen Supervisor</option>
            <option value="manager">Manager</option>
          </select>
          <input
            type="password"
            placeholder="New PIN"
            value={pinResetForm.newPin}
            onChange={(e) => setPinResetForm((prev) => ({ ...prev, newPin: e.target.value }))}
            required
          />
          <input
            type="password"
            placeholder="Confirm New PIN"
            value={pinResetForm.confirmPin}
            onChange={(e) => setPinResetForm((prev) => ({ ...prev, confirmPin: e.target.value }))}
            required
          />
          <button type="submit" disabled={resetSaving}>{resetSaving ? 'Resetting...' : 'Reset Staff PIN'}</button>
        </form>

        <h4>Staff List</h4>
        {loadingStaff ? (
          <p>Loading staff...</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {staff.map((member) => (
              <div key={member.id} style={{ border: '1px solid #475569', borderRadius: 8, padding: '0.5rem' }}>
                <div><strong>{member.name}</strong> ({member.role})</div>
                <div>Code: {member.code}</div>
                <div>Phone: {member.phone}</div>
                <div>Status: {member.active ? 'Active' : 'Inactive'}</div>
                {member.active ? (
                  <button type="button" onClick={() => setUserActive(member.id, false)}>Deactivate</button>
                ) : (
                  <button type="button" onClick={() => setUserActive(member.id, true)}>Reactivate</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <form onSubmit={submitAdjustment} style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
        <h3>Post-Preparation Bill Adjustment</h3>
        <input
          placeholder="Table number"
          value={form.tableNumber}
          onChange={(e) => setForm((prev) => ({ ...prev, tableNumber: e.target.value }))}
          required
        />
        <input
          placeholder="KOT item id"
          value={form.kotItemId}
          onChange={(e) => setForm((prev) => ({ ...prev, kotItemId: e.target.value }))}
          required
        />
        <input
          placeholder="Waiter user id"
          value={form.waiterUserId}
          onChange={(e) => setForm((prev) => ({ ...prev, waiterUserId: e.target.value }))}
          required
        />
        <textarea
          placeholder="Mandatory reason"
          value={form.reason}
          onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
          required
        />
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Approve Adjustment'}</button>
      </form>
      {logs.length === 0 ? (
        <p>No audit records yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {logs.map((log) => (
            <div key={log.id} style={{ border: '1px solid #334155', borderRadius: 8, padding: '0.75rem' }}>
              <div><strong>{log.action}</strong></div>
              <div>{log.entity_type} : {log.entity_id}</div>
              <div style={{ opacity: 0.75 }}>{new Date(log.created_at).toLocaleString()}</div>
              {log.remarks ? <div>Remarks: {log.remarks}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
