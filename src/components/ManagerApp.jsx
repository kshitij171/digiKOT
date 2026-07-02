import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { auditService } from '../services/auditService';
import { managerService } from '../services/managerService';
import { billingService } from '../services/billingService';
import { billModificationService } from '../services/billModificationService';
import { menuService } from '../services/menuService';
import CancelledKotsTab from './CancelledKotsTab';
import AuditBillDetailPanel from './AuditBillDetailPanel';
import { buildManagerBillDetail } from '../services/auditBillDetailService';
import { useAuth } from '../context/AuthContext';
import { hashPin, validatePin } from '../lib/utils/auth';
import './ManagerApp.css';

const ROLE_LABELS = { waiter: 'Waiter', kitchen_supervisor: 'Kitchen Supervisor', manager: 'Manager' };

// ── Helpers ───────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}
function fmtAmt(n) { return n != null ? `₹${Number(n).toFixed(2)}` : '—'; }
function shortId(id) { return id ? '#' + String(id).slice(-6).toUpperCase() : '—'; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function toFrom(dateStr) { return dateStr ? new Date(dateStr + 'T00:00:00').toISOString() : null; }
function toTo(dateStr) { return dateStr ? new Date(dateStr + 'T23:59:59').toISOString() : null; }

/** Removal discount % from bill_items (manager-approved removals, not waiter % discount). */
function computeRemovalDiscountPct(bill) {
  const items = bill.bill_items || [];
  let originalSubtotal = 0;
  let removedAmount = 0;

  for (const bi of items) {
    const unit = Number(bi.unit_price) || 0;
    const included = bi.include_in_bill !== false;
    const excl = bi.exclusion_reason;

    if (!included) {
      if (excl === 'removed_entirely') {
        const origQ = Number(bi.original_qty) || Number(bi.qty) || 0;
        originalSubtotal += origQ * unit;
        removedAmount += origQ * unit;
      }
      continue;
    }

    const remQ = Number(bi.removed_qty) || 0;
    const billQ = Number(bi.qty) || 0;
    if (remQ > 0) {
      let origQ = Number(bi.original_qty);
      if (!Number.isFinite(origQ) || origQ < billQ + remQ) {
        origQ = billQ + remQ;
      }
      originalSubtotal += origQ * unit;
      removedAmount += remQ * unit;
    } else if (billQ > 0) {
      originalSubtotal += billQ * unit;
    }
  }

  if (originalSubtotal <= 0) {
    return removedAmount > 0 ? 100 : 0;
  }
  const pct = (removedAmount / originalSubtotal) * 100;
  return Math.min(100, Math.round(pct * 100) / 100);
}

function matchesRemovalDiscountFilter(pct, filter) {
  if (filter === 'gte50') return pct >= 50;
  if (filter === 'eq100') return pct >= 99.995;
  return true;
}

/** Row badges: waiter % discount (matches expanded bill) vs removal % (items taken off). */
function billDiscountBadges(bill, removalDiscountPct) {
  const waiterPct = Number(bill.discount_percent) || 0;
  const removalPct = Number(removalDiscountPct) || 0;
  const badges = [];

  if (waiterPct > 0) {
    badges.push({
      key: 'waiter',
      label: `${Math.round(waiterPct)}% discount`,
      high: waiterPct >= 50,
    });
  }
  if (removalPct > 0 && Math.round(removalPct) !== Math.round(waiterPct)) {
    badges.push({
      key: 'removal',
      label: `${Math.round(removalPct)}% removed`,
      high: removalPct >= 50,
    });
  }
  return badges;
}

// ── MODIFICATIONS TAB ─────────────────────────────────────
function ModificationsTab({ currentUser }) {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [acting, setActing] = useState(null);
  const [rejectModal, setRejectModal] = useState(null); // { requestId }
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  // Real-time subscription
  useEffect(() => {
    return billModificationService.subscribeRequests(setRequests);
  }, []);

  const handleApprove = async (requestId) => {
    setActing(requestId);
    setActionError('');
    try {
      await billModificationService.approveRequest(requestId, currentUser.id);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r))
      );
    } catch (err) {
      setActionError(err.message || 'Failed to approve.');
    } finally {
      setActing(null);
    }
  };

  const openRejectModal = (requestId) => {
    setRejectModal({ requestId });
    setRejectReason('');
    setActionError('');
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setActionError('Reason is required.');
      return;
    }
    setActing(rejectModal.requestId);
    setActionError('');
    try {
      await billModificationService.rejectRequest(rejectModal.requestId, currentUser.id, reason);
      const nowIso = new Date().toISOString();
      const mgrLabel =
        (currentUser?.name && String(currentUser.name).trim()) ||
        (currentUser?.username ? `@${currentUser.username}` : null);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === rejectModal.requestId
            ? {
                ...r,
                status: 'rejected',
                rejection_reason: reason,
                reviewed_at: nowIso,
                rejected_at: nowIso,
                rejected_by_display_name: mgrLabel,
              }
            : r
        )
      );
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      setActionError(err.message || 'Failed to reject.');
    } finally {
      setActing(null);
    }
  };

  const visible = requests.filter((r) => filter === 'all' || r.status === filter);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="mod-section-header">
        <div>
          <div className="mod-section-title">
            <span className="mod-live-dot" />
            Bill Modification Requests
          </div>
          <div className="mod-section-desc">
            Real-time — approve or reject waiters' requests to remove items from a printed bill.
          </div>
        </div>
      </div>

      <div className="mod-filter-row">
        {[['pending', `Pending (${pendingCount})`], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([val, label]) => (
          <button
            key={val}
            className={`mod-filter-btn ${filter === val ? 'active' : ''}`}
            onClick={() => setFilter(val)}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{actionError}</p>
      )}

      {visible.length === 0 ? (
        <div className="mod-empty">
          {filter === 'pending' ? 'No pending requests — all clear.' : `No ${filter} requests.`}
        </div>
      ) : (
        visible.map((req) => {
          const isPending = req.status === 'pending';
          const items = Array.isArray(req.items_to_remove) ? req.items_to_remove : [];
          return (
            <div key={req.id} className={`mod-request-card ${req.status}`}>
              <div className="mod-req-header">
                <div className="mod-req-pill">
                  <span className="mod-req-table">
                    {req.table_number ? `Table ${req.table_number}` : 'Table —'}
                  </span>
                  <span className="mod-req-bill">{shortId(req.bill_id)}</span>
                  {req.waiter_username && (
                    <span className="mod-req-waiter">@{req.waiter_username}</span>
                  )}
                </div>
                <div className="mod-req-status">
                  {isPending ? (
                    <span className="mod-status-badge pending">Pending</span>
                  ) : (
                    <span className={`mod-status-badge ${req.status}`}>
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mod-req-time">{fmtDate(req.requested_at)}</div>

              <div className="mod-req-items" style={{ marginTop: '0.5rem' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                  Items requested for removal:
                </span>
                {items.map((item, idx) => (
                  <span
                    key={`${req.id}:${item?.kotId ?? ''}:${item?.itemId ?? item?.itemName ?? idx}`}
                    className="mod-req-item-tag"
                  >
                    {item.itemName} ×{item.qty}
                  </span>
                ))}
              </div>

              <div className="mod-req-reason">
                <strong style={{ color: 'var(--color-text-secondary)' }}>Reason: </strong>
                {req.reason}
              </div>

              {req.rejection_reason && (
                <div className="mod-req-reason" style={{ borderLeftColor: 'var(--color-danger)' }}>
                  <strong style={{ color: 'var(--color-danger)' }}>Rejection reason: </strong>
                  {req.rejection_reason}
                </div>
              )}

              {isPending && (
                <div className="mod-req-actions">
                  <button
                    className="btn-mod-reject"
                    disabled={acting === req.id}
                    onClick={() => openRejectModal(req.id)}
                  >
                    ✕ Reject
                  </button>
                  <button
                    className="btn-mod-approve"
                    disabled={acting === req.id}
                    onClick={() => handleApprove(req.id)}
                  >
                    {acting === req.id ? 'Processing…' : '✓ Accept'}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg-overlay)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', borderRadius: 12,
            padding: '1.5rem', width: '90%', maxWidth: 420,
          }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>Reject Request</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              A reason is required. The waiter will see it in their summary.
            </div>
            <textarea
              placeholder="Reason is required"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.65rem',
                borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-bg-app)',
                color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '0.85rem', resize: 'vertical',
              }}
            />
            {actionError && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>{actionError}</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setRejectModal(null)}
                style={{ padding: '0.45rem 1rem', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={!!acting || !rejectReason.trim()}
                className="btn-mod-reject"
                style={{ padding: '0.45rem 1.1rem' }}
              >
                {acting ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Never show raw Postgres/PostgREST errors in the staff UI. */
function staffFacingError(err, friendlyDefault) {
  const raw = String(err?.message || err || '');
  if (!raw) return friendlyDefault;
  if (
    /does not exist|42703|42P01|PGRST204|schema cache|permission denied|JWT expired|connection/i.test(
      raw
    )
  ) {
    return friendlyDefault;
  }
  return raw.length > 320 ? friendlyDefault : raw;
}

// ── STAFF TAB ─────────────────────────────────────────────
function StaffTab({ currentUser }) {
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffMessage, setStaffMessage] = useState('');
  const [staffError, setStaffError] = useState('');
  const [staffSaving, setStaffSaving] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
  const [staffForm, setStaffForm] = useState({ name: '', phone: '', username: '', role: 'waiter' });
  const [pinResetForm, setPinResetForm] = useState({ username: '' });
  const [pinHint, setPinHint] = useState({ status: 'idle', message: '' }); // idle|checking|available|taken
  const [resetPinHint, setResetPinHint] = useState({ status: 'idle', message: '' });

  const pinRef = React.useRef(null);
  const confirmPinRef = React.useRef(null);
  const newPinRef = React.useRef(null);
  const confirmNewPinRef = React.useRef(null);

  const refreshStaff = useCallback(async () => {
    if (!currentUser) return;
    setLoadingStaff(true);
    try {
      const rows = await managerService.listStaff({ managerUser: currentUser });
      setStaff(rows);
    } catch (err) {
      console.warn(err);
      setStaffError(
        staffFacingError(err, 'Unable to load staff. Please refresh the page. If this continues, ask an admin to verify the database is up to date.')
      );
    } finally {
      setLoadingStaff(false);
    }
  }, [currentUser]);

  useEffect(() => { refreshStaff(); }, [refreshStaff]);

  const normalizePinInput = (el) => {
    if (!el) return '';
    const next = String(el.value || '').replace(/\D/g, '').slice(0, 4);
    if (el.value !== next) el.value = next;
    return next;
  };

  const checkPinAvailability = useCallback(async (pinValue) => {
    if (!validatePin(pinValue)) {
      setPinHint({ status: 'idle', message: '' });
      return;
    }
    setPinHint({ status: 'checking', message: 'Checking availability…' });
    try {
      const pinHash = await hashPin(pinValue);
      const { available } = await managerService.checkPinHashAvailable({ pinHash });
      setPinHint(available
        ? { status: 'available', message: 'PIN is available.' }
        : { status: 'taken', message: 'PIN is already in use.' }
      );
    } catch (_) {
      // Best-effort hint only; do not block form.
      setPinHint({ status: 'idle', message: '' });
    }
  }, []);

  const checkResetPinAvailability = useCallback(async (pinValue) => {
    if (!validatePin(pinValue)) {
      setResetPinHint({ status: 'idle', message: '' });
      return;
    }
    setResetPinHint({ status: 'checking', message: 'Checking availability…' });
    try {
      const pinHash = await hashPin(pinValue);
      const { available } = await managerService.checkPinHashAvailable({ pinHash });
      setResetPinHint(available
        ? { status: 'available', message: 'PIN is available.' }
        : { status: 'taken', message: 'PIN is already in use.' }
      );
    } catch (_) {
      setResetPinHint({ status: 'idle', message: '' });
    }
  }, []);

  const submitStaffRegistration = async (e) => {
    e.preventDefault();
    setStaffMessage(''); setStaffError('');
    const pinValue = normalizePinInput(pinRef.current);
    const confirmPinValue = normalizePinInput(confirmPinRef.current);
    if (!validatePin(pinValue)) { setStaffError('PIN must be exactly 4 digits.'); return; }
    if (pinValue !== confirmPinValue) { setStaffError('PINs do not match.'); return; }
    setStaffSaving(true);
    try {
      const pinHash = await hashPin(pinValue);
      const created = await managerService.registerStaff({
        managerUser: currentUser, name: staffForm.name, phone: staffForm.phone,
        username: staffForm.username, role: staffForm.role, pinHash,
      });
      setStaffMessage(`Created. Staff code: ${created.code}`);
      setStaffForm({ name: '', phone: '', username: '', role: 'waiter' });
      if (pinRef.current) pinRef.current.value = '';
      if (confirmPinRef.current) confirmPinRef.current.value = '';
      setPinHint({ status: 'idle', message: '' });
      await refreshStaff();
    } catch (err) {
      setStaffError(staffFacingError(err, 'Unable to create staff.'));
    } finally {
      setStaffSaving(false);
    }
  };

  const submitPinReset = async (e) => {
    e.preventDefault();
    setStaffMessage(''); setStaffError('');
    const pinValue = normalizePinInput(newPinRef.current);
    const confirmPinValue = normalizePinInput(confirmNewPinRef.current);
    if (!validatePin(pinValue)) { setStaffError('New PIN must be exactly 4 digits.'); return; }
    if (pinValue !== confirmPinValue) { setStaffError('PINs do not match.'); return; }
    setResetSaving(true);
    try {
      const newPinHash = await hashPin(pinValue);
      await managerService.resetStaffPin({ managerUser: currentUser, username: pinResetForm.username, newPinHash });
      setStaffMessage('PIN reset successful.');
      setPinResetForm({ username: '' });
      if (newPinRef.current) newPinRef.current.value = '';
      if (confirmNewPinRef.current) confirmNewPinRef.current.value = '';
      setResetPinHint({ status: 'idle', message: '' });
    } catch (err) {
      setStaffError(staffFacingError(err, 'Unable to reset PIN.'));
    } finally {
      setResetSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setStaffMessage(''); setStaffError('');
    try {
      await managerService.deleteStaff({ managerUser: currentUser, userId: deleteConfirm.id });
      setStaffMessage(`${deleteConfirm.name} has been removed from the system.`);
      setDeleteConfirm(null);
      await refreshStaff();
    } catch (err) {
      setStaffError(staffFacingError(err, 'Unable to remove staff.'));
      setDeleteConfirm(null);
    }
  };

  const sField = (label, inputProps) => {
    const { ref, ...rest } = inputProps || {};
    return (
    <div className="staff-field">
      <label>{label}</label>
      <input ref={ref} className="staff-input" {...rest} />
    </div>
  );
  };

  return (
    <div>
      {staffError && <p className="staff-error-msg">{staffError}</p>}
      {staffMessage && <p className="staff-message">{staffMessage}</p>}

      {/* Add Staff */}
      <div className="staff-section">
        <div className="staff-section-title">Add Staff Member</div>
        <form onSubmit={submitStaffRegistration} className="staff-form">
          {sField('Full Name *', { placeholder: 'Full name', value: staffForm.name, onChange: (e) => setStaffForm((p) => ({ ...p, name: e.target.value })), required: true })}
          {sField('Phone Number *', { placeholder: '10-digit phone', value: staffForm.phone, onChange: (e) => setStaffForm((p) => ({ ...p, phone: e.target.value })), required: true })}
          {sField('Username *', { placeholder: 'e.g. rajan_w', value: staffForm.username, onChange: (e) => setStaffForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, '') })), required: staffForm.role === 'waiter' })}
          <div className="staff-field">
            <label>Role *</label>
            <select className="staff-select" value={staffForm.role} onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="waiter">Waiter</option>
              <option value="kitchen_supervisor">Kitchen Supervisor</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div className="staff-field">
            <label>4-digit PIN *</label>
            <input
              className="staff-input"
              type="password"
              placeholder="••••"
              maxLength={4}
              ref={pinRef}
              onInput={(e) => {
                const next = normalizePinInput(e.target);
                checkPinAvailability(next);
              }}
              required
            />
            {pinHint.message && (
              <div
                className="pin-suggestions"
                style={{ marginTop: '0.4rem', padding: '0.4rem 0.55rem' }}
              >
                <span
                  className="pin-suggestions-label"
                  style={{
                    color:
                      pinHint.status === 'available'
                        ? 'var(--color-success)'
                        : pinHint.status === 'taken'
                          ? 'var(--color-danger)'
                          : 'var(--color-text-secondary)',
                  }}
                >
                  {pinHint.message}
                </span>
              </div>
            )}
          </div>
          {sField('Confirm PIN *', {
            type: 'password',
            placeholder: '••••',
            maxLength: 4,
            inputMode: 'numeric',
            ref: confirmPinRef,
            onInput: (e) => normalizePinInput(e.target),
            required: true,
          })}
          <button type="submit" className="btn-staff-submit" disabled={staffSaving}>
            {staffSaving ? 'Creating…' : 'Create Staff Member'}
          </button>
        </form>
      </div>

      {/* Reset PIN */}
      <div className="staff-section">
        <div className="staff-section-title">Reset PIN by Username</div>
        <form onSubmit={submitPinReset} className="staff-form">
          {sField('Username *', { placeholder: 'Staff username', value: pinResetForm.username, onChange: (e) => setPinResetForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, '') })), required: true })}
          {sField('New 4-digit PIN *', {
            type: 'password',
            placeholder: '••••',
            maxLength: 4,
            inputMode: 'numeric',
            ref: newPinRef,
            onInput: (e) => {
              const next = normalizePinInput(e.target);
              checkResetPinAvailability(next);
            },
            required: true,
          })}
          {resetPinHint.message && (
            <div className="staff-field" style={{ marginTop: '-0.35rem' }}>
              <div
                className="pin-suggestions"
                style={{ padding: '0.4rem 0.55rem' }}
              >
                <span
                  className="pin-suggestions-label"
                  style={{
                    color:
                      resetPinHint.status === 'available'
                        ? 'var(--color-success)'
                        : resetPinHint.status === 'taken'
                          ? 'var(--color-danger)'
                          : 'var(--color-text-secondary)',
                  }}
                >
                  {resetPinHint.message}
                </span>
              </div>
            </div>
          )}
          {sField('Confirm New PIN *', {
            type: 'password',
            placeholder: '••••',
            maxLength: 4,
            inputMode: 'numeric',
            ref: confirmNewPinRef,
            onInput: (e) => normalizePinInput(e.target),
            required: true,
          })}
          <button type="submit" className="btn-staff-reset" disabled={resetSaving}>
            {resetSaving ? 'Resetting…' : 'Reset PIN'}
          </button>
        </form>
      </div>

      {/* Staff List */}
      <div className="staff-section">
        <div className="staff-section-title">All Staff</div>
        {loadingStaff ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Loading…</p>
        ) : staff.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No staff members registered.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Full Name</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Username</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Role</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Phone</th>
                <th style={{ padding: '0.4rem 0.5rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--color-bg-surface)' }}>
                  <td style={{ padding: '0.5rem 0.5rem', color: 'var(--color-text-primary)', fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: '0.5rem 0.5rem', color: 'var(--color-text-secondary)' }}>{m.username ? `@${m.username}` : '—'}</td>
                  <td style={{ padding: '0.5rem 0.5rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: 4, background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)' }}>
                      {ROLE_LABELS[m.role] || m.role}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.5rem', color: 'var(--color-text-muted)' }}>{m.phone}</td>
                  <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                    <button
                      className="btn-deactivate"
                      style={{ background: 'var(--color-danger)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
                      onClick={() => setDeleteConfirm({ id: m.id, name: m.name })}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg-overlay)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div style={{
            background: 'var(--color-bg-surface)', border: '1px solid var(--color-danger)', borderRadius: 12,
            padding: '1.5rem', width: '90%', maxWidth: 400,
          }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
              Remove staff member?
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              Are you sure you want to remove <strong style={{ color: 'var(--color-text-primary)' }}>{deleteConfirm.name}</strong> from the system?
              Their PIN will be freed up and they will no longer be able to log in.
              Historical KOTs and bills attributed to them are preserved.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ padding: '0.45rem 1rem', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{ padding: '0.45rem 1.1rem', background: 'var(--color-danger)', color: 'var(--color-danger)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PAGERS TAB ────────────────────────────────────────────
function PagersTab({ currentUser }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [dashboard, setDashboard] = useState({ rows: [], freePagerCodes: [], eligibleWaiters: [] });
  const [assignForm, setAssignForm] = useState({ waiterUserId: '', deviceCode: '' });
  const [assignSaving, setAssignSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setErr('');
    try {
      const data = await managerService.listPagerDashboard({ managerUser: currentUser });
      setDashboard(data);
    } catch (e) {
      setErr(e.message || 'Unable to load pagers.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAssign = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (!assignForm.waiterUserId || !assignForm.deviceCode) {
      setErr('Select a waiter and a free pager.');
      return;
    }
    setAssignSaving(true);
    try {
      await managerService.assignPagerToWaiter({
        managerUser: currentUser,
        waiterUserId: assignForm.waiterUserId,
        deviceCode: assignForm.deviceCode,
      });
      setMsg('Pager assigned. Hand the device to the waiter.');
      setAssignForm({ waiterUserId: '', deviceCode: '' });
      await load();
    } catch (e) {
      setErr(e.message || 'Unable to assign pager.');
    } finally {
      setAssignSaving(false);
    }
  };

  const doUnassign = async (deviceCode) => {
    setMsg('');
    setErr('');
    try {
      await managerService.unassignPagerFromDevice({ managerUser: currentUser, deviceCode });
      setMsg('Pager returned to pool.');
      await load();
    } catch (e) {
      setErr(e.message || 'Unable to unassign.');
    }
  };

  return (
    <div>
      <p className="mgr-section-h">
        Pagers are registered during install setup (<code>/setup</code>). Assign a free pager to a waiter for shift handover; only free pagers appear in the list.
      </p>
      {err && <p className="staff-error-msg">{err}</p>}
      {msg && <p className="staff-message">{msg}</p>}

      <div className="staff-section">
        <div className="staff-section-title">Assign pager</div>
        <form onSubmit={submitAssign} className="staff-form">
          <div className="staff-field">
            <label>Waiter (no pager yet) *</label>
            <select
              className="staff-select"
              value={assignForm.waiterUserId}
              onChange={(e) => setAssignForm((p) => ({ ...p, waiterUserId: e.target.value }))}
              required
            >
              <option value="">— Select —</option>
              {dashboard.eligibleWaiters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.username ? ` (@${w.username})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="staff-field">
            <label>Free pager *</label>
            <select
              className="staff-select"
              value={assignForm.deviceCode}
              onChange={(e) => setAssignForm((p) => ({ ...p, deviceCode: e.target.value }))}
              required
            >
              <option value="">— Select —</option>
              {dashboard.freePagerCodes.map((code) => {
                const d = dashboard.rows.find((r) => r.device_code === code);
                return (
                  <option key={code} value={code}>
                    {d?.label || code} ({code})
                  </option>
                );
              })}
            </select>
          </div>
          <button type="submit" className="btn-staff-submit" disabled={assignSaving || dashboard.freePagerCodes.length === 0}>
            {assignSaving ? 'Saving…' : 'Assign pager'}
          </button>
        </form>
      </div>

      <div className="staff-section">
        <div className="staff-section-title">Pager pool</div>
        {loading ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading…</p>
        ) : dashboard.rows.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>
            No pager devices yet. Run install setup at <code>/setup</code> with ESPs on the ROOT router, then return here to assign waiters.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Device code</th>
                  <th>MAC</th>
                  <th>Provision</th>
                  <th>Assignment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dashboard.rows.map((r) => (
                  <tr key={r.device_code}>
                    <td>{r.label}</td>
                    <td><code style={{ fontSize: '0.78rem' }}>{r.device_code}</code></td>
                    <td><code style={{ fontSize: '0.78rem' }}>{r.mac_address}</code></td>
                    <td>
                      <code style={{ fontSize: '0.78rem' }}>{r.provision_state || 'offline'}</code>
                    </td>
                    <td>
                      {!r.active ? (
                        <span style={{ color: '#94a3b8' }}>Inactive device</span>
                      ) : r.waiter ? (
                        <>
                          Assigned to <strong>{r.waiter.name}</strong>
                          {r.waiter.username ? <span style={{ color: '#64748b' }}> @{r.waiter.username}</span> : null}
                        </>
                      ) : (
                        <span style={{ color: '#22c55e' }}>Available</span>
                      )}
                    </td>
                    <td>
                      {r.active && r.assignment ? (
                        <button type="button" className="btn-reactivate" onClick={() => doUnassign(r.device_code)}>
                          Return to pool
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
  );
}

// ── BILLS TAB ─────────────────────────────────────────────
function BillsTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [dates, setDates] = useState({ from: today, to: today });
  const [search, setSearch] = useState('');
  const [discountFilter, setDiscountFilter] = useState('all');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [billAuditCache, setBillAuditCache] = useState({});
  const [billAuditLoading, setBillAuditLoading] = useState(null);

  const billsWithRemovalDiscount = useMemo(
    () => bills.map((b) => ({ bill: b, removalDiscountPct: computeRemovalDiscountPct(b) })),
    [bills]
  );

  const displayedBills = useMemo(
    () => billsWithRemovalDiscount.filter(({ removalDiscountPct }) =>
      matchesRemovalDiscountFilter(removalDiscountPct, discountFilter)
    ),
    [billsWithRemovalDiscount, discountFilter]
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const from = dates.from ? new Date(dates.from + 'T00:00:00').toISOString() : null;
      const to   = dates.to   ? new Date(dates.to   + 'T23:59:59').toISOString() : null;
      const data = await billingService.listBills({ fromDate: from, toDate: to, search: search.trim() });
      setBills(data || []);
    } catch (e) {
      setError(e.message || 'Failed to load bills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dates.from, dates.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBillRow = async (billId) => {
    if (expanded === billId) {
      setExpanded(null);
      return;
    }
    setExpanded(billId);
    if (!billAuditCache[billId]) {
      setBillAuditLoading(billId);
      try {
        const auditBill = await buildManagerBillDetail(billId);
        setBillAuditCache((c) => ({ ...c, [billId]: auditBill }));
      } catch (e) {
        console.warn(e);
        setBillAuditCache((c) => ({ ...c, [billId]: { error: 'Could not load annotated bill.' } }));
      } finally {
        setBillAuditLoading(null);
      }
    }
  };
  const handleSearch = (e) => {
    e.preventDefault();
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>From</label>
          <input type="date" className="audit-date-input" value={dates.from} onChange={e => setDates(p => ({ ...p, from: e.target.value }))} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>To</label>
          <input type="date" className="audit-date-input" value={dates.to} onChange={e => setDates(p => ({ ...p, to: e.target.value }))} />
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            type="text"
            className="inv-search"
            placeholder="Search waiter / bill ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 180 }}
          />
          <button type="submit" style={{ padding: '0.4rem 0.85rem', background: 'var(--color-border-default)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
            Search
          </button>
        </form>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Filter by discount</label>
          <select
            className="audit-date-input"
            value={discountFilter}
            onChange={(e) => setDiscountFilter(e.target.value)}
            style={{ minWidth: 168, cursor: 'pointer' }}
          >
            <option value="all">All bills</option>
            <option value="gte50">Discount ≥ 50%</option>
            <option value="eq100">Discount = 100%</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="audit-empty">Loading…</p>
      ) : error ? (
        <p className="audit-error">{error}</p>
      ) : bills.length === 0 ? (
        <p className="audit-empty">No bills found for this date range.</p>
      ) : displayedBills.length === 0 ? (
        <p className="audit-empty">No bills match this discount filter.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="audit-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Table</th>
                <th>Waiter</th>
                <th>Items</th>
                <th>Subtotal</th>
                <th>Grand total</th>
                <th>Cleared at</th>
              </tr>
            </thead>
            <tbody>
              {displayedBills.map(({ bill: b, removalDiscountPct }) => {
                const isExpanded = expanded === b.id;
                const items = b.bill_items || [];
                const includedItems = items.filter(i => i.include_in_bill !== false);
                const auditBill = billAuditCache[b.id];
                const auditLoading = billAuditLoading === b.id;
                const discountBadges = billDiscountBadges(b, removalDiscountPct);
                return (
                  <React.Fragment key={b.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleBillRow(b.id)}
                    >
                      <td>
                        <span className="mono">{shortId(b.id)}</span>
                        {discountBadges.map((badge) => (
                          <span
                            key={badge.key}
                            style={{
                              display: 'inline-block',
                              marginLeft: '0.45rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: 4,
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              background: badge.high ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                              color: badge.high ? 'var(--color-danger)' : 'var(--color-warning)',
                              border: `1px solid ${badge.high ? 'color-mix(in srgb, var(--color-danger) 35%, transparent)' : 'color-mix(in srgb, var(--color-warning) 35%, transparent)'}`,
                              verticalAlign: 'middle',
                            }}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </td>
                      <td>Table {b.table_number}</td>
                      <td><span className="tag-waiter">{b.waiter_username ? `@${b.waiter_username}` : '—'}</span></td>
                      <td>{includedItems.length}</td>
                      <td>{fmtAmt(b.subtotal)}</td>
                      <td style={{ fontWeight: 700 }}>{fmtAmt(b.total)}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{fmtDate(b.cleared_at)}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-app)', verticalAlign: 'top' }}>
                          {auditLoading && (
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>Loading annotated bill…</span>
                          )}
                          {!auditLoading && (
                            <AuditBillDetailPanel pct={Number(b.discount_percent) || 0} auditBill={auditBill} />
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── TOOLS TAB ─────────────────────────────────────────────
function ToolsTab({ currentUser }) {
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ tableNumber: '', kotItemId: '', waiterUserId: '', reason: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => auditService.subscribeRecent(setLogs), []);

  const submitAdjustment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await managerService.createPostPrepAdjustment?.({
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

  const sField = (label, inputProps) => (
    <div className="staff-field">
      <label>{label}</label>
      <input className="staff-input" {...inputProps} />
    </div>
  );

  return (
    <div>
      <div className="staff-section">
        <div className="staff-section-title">Post-Preparation Bill Adjustment</div>
        <form onSubmit={submitAdjustment} className="staff-form">
          {sField('Table Number *', { placeholder: 'e.g. 5', value: form.tableNumber, onChange: (e) => setForm((p) => ({ ...p, tableNumber: e.target.value })), required: true })}
          {sField('KOT Item ID *', { placeholder: 'kot_item id', value: form.kotItemId, onChange: (e) => setForm((p) => ({ ...p, kotItemId: e.target.value })), required: true })}
          {sField('Waiter User ID *', { placeholder: 'user id', value: form.waiterUserId, onChange: (e) => setForm((p) => ({ ...p, waiterUserId: e.target.value })), required: true })}
          <div className="staff-field">
            <label>Reason *</label>
            <textarea
              placeholder="Mandatory reason"
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              required
              rows={2}
              className="staff-input"
              style={{ resize: 'vertical' }}
            />
          </div>
          <button type="submit" disabled={saving} className="btn-staff-submit" style={{ background: '#7c3aed' }}>
            {saving ? 'Saving…' : 'Approve Adjustment'}
          </button>
        </form>
      </div>

      {/* Audit Feed */}
      <div className="staff-section">
        <div className="staff-section-title">Audit Feed</div>
        {logs.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>No audit records yet.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} style={{ borderBottom: '1px solid #334155', padding: '0.5rem 0' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.action}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {log.entity_type} · {log.entity_id} · {fmtDate(log.created_at)}
              </div>
              {log.remarks && (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                  {log.remarks}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── INVENTORY TAB ─────────────────────────────────────────
function InventoryTab() {
  const [items, setItems]           = useState([]);
  const [filter, setFilter]         = useState('all');   // 'all' | 'available' | 'oos'
  const [search, setSearch]         = useState('');
  const [toggling, setToggling]     = useState(null);
  const [toastMsg, setToastMsg]     = useState('');

  useEffect(() => {
    return menuService.subscribeMenu(setItems);
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const handleToggle = async (item) => {
    setToggling(item.id);
    try {
      await menuService.setOutOfStock(item.id, !item.outOfStock);
      showToast(`${item.name} marked as ${item.outOfStock ? 'available' : 'out of stock'}`);
    } catch (err) {
      console.error('Toggle error:', err);
    } finally {
      setToggling(null);
    }
  };

  const displayed = items.filter(item => {
    if (filter === 'oos'       && !item.outOfStock) return false;
    if (filter === 'available' &&  item.outOfStock) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const oosCount = items.filter(i => i.outOfStock).length;

  return (
    <div className="inv-root">
      {toastMsg && <div className="inv-toast">{toastMsg}</div>}

      <div className="inv-topbar">
        <div>
          <h2 className="mgr-section-h" style={{ margin: 0 }}>Inventory Management</h2>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            {oosCount} item{oosCount !== 1 ? 's' : ''} currently out of stock — changes reflect on waiter screens in real time
          </p>
        </div>

        <div className="inv-controls">
          <input
            type="text"
            className="inv-search"
            placeholder="🔍 Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="inv-filter-btns">
            {[['all', 'All'], ['available', 'Available'], ['oos', 'Out of Stock']].map(([val, label]) => (
              <button
                key={val}
                className={`inv-filter-btn ${filter === val ? 'active' : ''}`}
                onClick={() => setFilter(val)}
              >
                {label}
                {val === 'oos' && oosCount > 0 && (
                  <span className="inv-oos-count">{oosCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="inv-grid">
        {displayed.length === 0 ? (
          <div className="inv-empty">No items found.</div>
        ) : (
          displayed.map(item => (
            <div key={item.id} className={`inv-card ${item.outOfStock ? 'oos' : ''}`}>
              <div className="inv-card-img-wrap">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="inv-card-img"
                  loading="lazy"
                  onError={e => { e.target.src = '/placeholder.svg'; }}
                />
                {item.outOfStock && (
                  <span className="inv-oos-badge">OUT OF STOCK</span>
                )}
                <span className={`inv-veg-dot ${item.isVegetarian ? 'veg' : 'nonveg'}`} title={item.isVegetarian ? 'Veg' : 'Non-Veg'} />
              </div>
              <div className="inv-card-body">
                <div className="inv-card-name" title={item.name}>{item.name}</div>
                <div className="inv-card-cat">{item.category}</div>
                <div className="inv-card-footer">
                  <span className="inv-card-price">₹{item.price}</span>
                  <button
                    className={`inv-toggle-btn ${item.outOfStock ? 'mark-avail' : 'mark-oos'}`}
                    onClick={() => handleToggle(item)}
                    disabled={toggling === item.id}
                  >
                    {toggling === item.id
                      ? '…'
                      : item.outOfStock ? 'Mark Available' : 'Mark OOS'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── MAIN MANAGER APP ──────────────────────────────────────
export default function ManagerApp() {
  const { currentUser, logoutUser } = useAuth();
  const [activeTab, setActiveTab] = useState('modifications');
  const [pendingCount, setPendingCount] = useState(0);

  // Track pending count for badge on Modifications tab
  useEffect(() => {
    return billModificationService.subscribeRequests((reqs) => {
      setPendingCount((reqs || []).filter((r) => r.status === 'pending').length);
    });
  }, []);

  const tabs = [
    { id: 'modifications', label: 'Modifications', badge: pendingCount },
    { id: 'cancelled-kots', label: 'Cancelled KOTs' },
    { id: 'bills',         label: 'Bills' },
    { id: 'inventory',     label: 'Inventory' },
    { id: 'staff',         label: 'Staff' },
    { id: 'pagers',        label: 'Pagers' },
    { id: 'tools',         label: 'Tools' },
  ];

  return (
    <div className="mgr-shell">
      <div className="mgr-topbar">
        <div>
          <div className="mgr-topbar-brand">Manager's Interface</div>
          <div className="mgr-topbar-sub">Audit · Approvals · Staff</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="mgr-topbar-user">@{currentUser?.username || currentUser?.name}</div>
          <button
            onClick={logoutUser}
            style={{ padding: '0.3rem 0.75rem', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="mgr-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`mgr-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.badge > 0 && <span className="mgr-tab-badge">{tab.badge}</span>}
          </button>
        ))}
      </div>

      <div className="mgr-content">
        {activeTab === 'modifications' && <ModificationsTab currentUser={currentUser} />}
        <div className="mgr-tab-panel" hidden={activeTab !== 'cancelled-kots'}>
          <CancelledKotsTab active={activeTab === 'cancelled-kots'} />
        </div>
        {activeTab === 'bills'         && <BillsTab />}
        {activeTab === 'inventory'     && <InventoryTab />}
        {activeTab === 'staff'         && <StaffTab currentUser={currentUser} />}
        {activeTab === 'pagers'        && <PagersTab currentUser={currentUser} />}
        {activeTab === 'tools'         && <ToolsTab currentUser={currentUser} />}
      </div>
    </div>
  );
}
