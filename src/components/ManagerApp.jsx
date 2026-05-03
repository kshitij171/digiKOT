import React, { useEffect, useState, useCallback } from 'react';
import { auditService } from '../services/auditService';
import { managerService } from '../services/managerService';
import { billingService } from '../services/billingService';
import { kotService } from '../services/kotService';
import { billModificationService } from '../services/billModificationService';
import { menuService } from '../services/menuService';
import { useAuth } from '../context/AuthContext';
import { validatePin } from '../lib/utils/auth';
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

// ── DateFilter ────────────────────────────────────────────
function DateFilter({ value, onChange }) {
  return (
    <div className="audit-card-controls" onClick={(e) => e.stopPropagation()}>
      <input
        type="date"
        className="audit-date-input"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
      />
      <span className="audit-date-sep">→</span>
      <input
        type="date"
        className="audit-date-input"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
      />
    </div>
  );
}

// ── AuditSection ──────────────────────────────────────────
function AuditSection({ icon, title, description, loadData, renderRows }) {
  const today = todayStr();
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState({ from: today, to: today });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadData({ fromDate: toFrom(dates.from), toDate: toTo(dates.to) });
      setRows(data || []);
    } catch (e) {
      setError(e.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [dates.from, dates.to, loadData]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleDatesChange = (next) => {
    setDates(next);
  };

  return (
    <div className="audit-card">
      <div className="audit-card-header" onClick={() => setOpen((o) => !o)}>
        <div className="audit-card-icon">{icon}</div>
        <div className="audit-card-meta">
          <div className="audit-card-title">{title}</div>
          <div className="audit-card-desc">{description}</div>
        </div>
        <DateFilter value={dates} onChange={handleDatesChange} />
        <span className="audit-card-chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="audit-card-body">
          {loading ? (
            <p className="audit-empty">Loading…</p>
          ) : error ? (
            <p className="audit-error">{error}</p>
          ) : rows.length === 0 ? (
            <p className="audit-empty">No records for this date range.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="audit-table">{renderRows(rows)}</table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AUDIT TAB ─────────────────────────────────────────────
function AuditTab() {
  return (
    <div>
      <p className="mgr-section-h">Click a section to expand and filter by date</p>

      {/* 1. Void Bills */}
      <AuditSection
        icon="🚫"
        title="1. Void Bills"
        description="Bills cancelled after printing by management."
        loadData={billingService.listVoidBills.bind(billingService)}
        renderRows={(rows) => (
          <>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Table</th>
                <th>Waiter</th>
                <th>Original Total</th>
                <th>Voided By</th>
                <th>Void Reason</th>
                <th>Voided At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><span className="mono">{shortId(b.id)}</span></td>
                  <td>Table {b.table_number}</td>
                  <td><span className="tag-waiter">{b.waiter_username ? `@${b.waiter_username}` : '—'}</span></td>
                  <td>{fmtAmt(b.total)}</td>
                  <td className="mono">{b.voided_by ? shortId(b.voided_by) : '—'}</td>
                  <td style={{ maxWidth: 180, wordBreak: 'break-word' }}>{b.void_reason || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.voided_at)}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      />

      {/* 2. Indent Received */}
      <AuditSection
        icon="📬"
        title="2. Indent Received"
        description="KOTs acknowledged by the kitchen as received and accepted."
        loadData={kotService.listIndentReceived.bind(kotService)}
        renderRows={(rows) => (
          <>
            <thead>
              <tr>
                <th>KOT</th>
                <th>Table</th>
                <th>Waiter</th>
                <th>Items</th>
                <th>KOT Sent</th>
                <th>Acknowledged At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td><span className="mono">{shortId(k.id)}</span></td>
                  <td>Table {k.tableNumber}</td>
                  <td><span className="tag-waiter">{k.waiterUsername ? `@${k.waiterUsername}` : '—'}</span></td>
                  <td style={{ maxWidth: 200 }}>
                    {(k.items || []).map((i) => `${i.name} ×${i.qty}`).join(', ') || '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(k.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: '#34d399' }}>{fmtDate(k.indentReceivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      />

      {/* 3. Cancelled KOTs */}
      <AuditSection
        icon="✕"
        title="3. Cancelled KOTs"
        description="KOTs cancelled before or during preparation."
        loadData={kotService.listCancelledKots.bind(kotService)}
        renderRows={(rows) => (
          <>
            <thead>
              <tr>
                <th>KOT</th>
                <th>Table</th>
                <th>Waiter</th>
                <th>Items</th>
                <th>Cancel Reason</th>
                <th>Cancelled At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td><span className="mono">{shortId(k.id)}</span></td>
                  <td>Table {k.tableNumber}</td>
                  <td><span className="tag-waiter">{k.waiterUsername ? `@${k.waiterUsername}` : '—'}</span></td>
                  <td style={{ maxWidth: 200 }}>
                    {(k.items || []).map((i) => `${i.name} ×${i.qty}`).join(', ') || '—'}
                  </td>
                  <td style={{ maxWidth: 180, wordBreak: 'break-word' }}>{k.cancelReason || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(k.cancelledAt)}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      />

      {/* 4. Discounts > 50% */}
      <AuditSection
        icon="🏷️"
        title="4. High Discounts (> 50%)"
        description="Bills where a discount of more than 50% was applied — flagged for review."
        loadData={(opts) => billingService.listHighDiscountBills({ ...opts, threshold: 50 })}
        renderRows={(rows) => (
          <>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Table</th>
                <th>Waiter</th>
                <th>Original Total</th>
                <th>Discount %</th>
                <th>Final Total</th>
                <th>Applied At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><span className="mono">{shortId(b.id)}</span></td>
                  <td>Table {b.table_number}</td>
                  <td><span className="tag-waiter">{b.waiter_username ? `@${b.waiter_username}` : '—'}</span></td>
                  <td>{fmtAmt(b.subtotal)}</td>
                  <td><span style={{ color: '#f87171', fontWeight: 700 }}>{b.discount_percent}%</span></td>
                  <td style={{ color: '#34d399' }}>{fmtAmt(b.total)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.discount_applied_at)}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      />

      {/* 5. Resettled Bills */}
      <AuditSection
        icon="🔁"
        title="5. Resettled Bills"
        description="Bills that were closed and then reopened for re-settlement."
        loadData={billingService.listResettledBills.bind(billingService)}
        renderRows={(rows) => (
          <>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Table</th>
                <th>Waiter</th>
                <th>Total</th>
                <th>Original Payment</th>
                <th>New Payment</th>
                <th>Resettled At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><span className="mono">{shortId(b.id)}</span></td>
                  <td>Table {b.table_number}</td>
                  <td><span className="tag-waiter">{b.waiter_username ? `@${b.waiter_username}` : '—'}</span></td>
                  <td>{fmtAmt(b.total)}</td>
                  <td>{b.original_payment_method || '—'}</td>
                  <td style={{ color: '#34d399' }}>{b.new_payment_method || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.resettled_at)}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      />
    </div>
  );
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
    setActing(rejectModal.requestId);
    setActionError('');
    try {
      await billModificationService.rejectRequest(rejectModal.requestId, currentUser.id, rejectReason.trim() || null);
      setRequests((prev) =>
        prev.map((r) => (r.id === rejectModal.requestId ? { ...r, status: 'rejected' } : r))
      );
      setRejectModal(null);
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
        <p style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{actionError}</p>
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
                <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                  Items requested for removal:
                </span>
                {items.map((item, idx) => (
                  <span key={idx} className="mod-req-item-tag">
                    {item.itemName} ×{item.qty}
                  </span>
                ))}
              </div>

              <div className="mod-req-reason">
                <strong style={{ color: '#94a3b8' }}>Reason: </strong>
                {req.reason}
              </div>

              {req.rejection_reason && (
                <div className="mod-req-reason" style={{ borderLeftColor: '#7f1d1d' }}>
                  <strong style={{ color: '#f87171' }}>Rejection reason: </strong>
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
            padding: '1.5rem', width: '90%', maxWidth: 420,
          }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>Reject Request</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Optionally provide a reason for rejection. The waiter will be notified.
            </div>
            <textarea
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.65rem',
                borderRadius: 6, border: '1px solid #334155', background: '#0f172a',
                color: '#e2e8f0', fontFamily: 'inherit', fontSize: '0.85rem', resize: 'vertical',
              }}
            />
            {actionError && (
              <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>{actionError}</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setRejectModal(null)}
                style={{ padding: '0.45rem 1rem', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={!!acting}
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

// ── STAFF TAB ─────────────────────────────────────────────
function StaffTab({ currentUser }) {
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffMessage, setStaffMessage] = useState('');
  const [staffError, setStaffError] = useState('');
  const [staffSaving, setStaffSaving] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: '', phone: '', username: '', role: 'waiter', pin: '', confirmPin: '' });
  const [pinResetForm, setPinResetForm] = useState({ username: '', newPin: '', confirmPin: '' });

  const refreshStaff = useCallback(async () => {
    if (!currentUser) return;
    setLoadingStaff(true);
    try {
      const rows = await managerService.listStaff({ managerUser: currentUser });
      setStaff(rows);
    } catch (err) {
      setStaffError(err.message || 'Unable to load staff.');
    } finally {
      setLoadingStaff(false);
    }
  }, [currentUser]);

  useEffect(() => { refreshStaff(); }, [refreshStaff]);

  const submitStaffRegistration = async (e) => {
    e.preventDefault();
    setStaffMessage(''); setStaffError('');
    if (!validatePin(staffForm.pin)) { setStaffError('PIN must be exactly 4 digits.'); return; }
    if (staffForm.pin !== staffForm.confirmPin) { setStaffError('PINs do not match.'); return; }
    setStaffSaving(true);
    try {
      const created = await managerService.registerStaff({
        managerUser: currentUser, name: staffForm.name, phone: staffForm.phone,
        username: staffForm.username, role: staffForm.role, pin: staffForm.pin,
      });
      setStaffMessage(`Created. Staff code: ${created.code}`);
      setStaffForm({ name: '', phone: '', username: '', role: 'waiter', pin: '', confirmPin: '' });
      await refreshStaff();
    } catch (err) {
      setStaffError(err.message || 'Unable to create staff.');
    } finally {
      setStaffSaving(false);
    }
  };

  const submitPinReset = async (e) => {
    e.preventDefault();
    setStaffMessage(''); setStaffError('');
    if (!validatePin(pinResetForm.newPin)) { setStaffError('New PIN must be exactly 4 digits.'); return; }
    if (pinResetForm.newPin !== pinResetForm.confirmPin) { setStaffError('PINs do not match.'); return; }
    setResetSaving(true);
    try {
      await managerService.resetStaffPin({ managerUser: currentUser, username: pinResetForm.username, newPin: pinResetForm.newPin });
      setStaffMessage('PIN reset successful.');
      setPinResetForm({ username: '', newPin: '', confirmPin: '' });
    } catch (err) {
      setStaffError(err.message || 'Unable to reset PIN.');
    } finally {
      setResetSaving(false);
    }
  };

  const setUserActive = async (userId, active) => {
    setStaffMessage(''); setStaffError('');
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

  const sField = (label, inputProps) => (
    <div className="staff-field">
      <label>{label}</label>
      <input className="staff-input" {...inputProps} />
    </div>
  );

  const activeWaiters = staff.filter((m) => m.role === 'waiter' && m.active);

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
          {sField('4-digit PIN *', { type: 'password', placeholder: '••••', maxLength: 4, value: staffForm.pin, onChange: (e) => setStaffForm((p) => ({ ...p, pin: e.target.value.replace(/\D/g, '') })), required: true })}
          {sField('Confirm PIN *', { type: 'password', placeholder: '••••', maxLength: 4, value: staffForm.confirmPin, onChange: (e) => setStaffForm((p) => ({ ...p, confirmPin: e.target.value.replace(/\D/g, '') })), required: true })}
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
          {sField('New 4-digit PIN *', { type: 'password', placeholder: '••••', maxLength: 4, value: pinResetForm.newPin, onChange: (e) => setPinResetForm((p) => ({ ...p, newPin: e.target.value.replace(/\D/g, '') })), required: true })}
          {sField('Confirm New PIN *', { type: 'password', placeholder: '••••', maxLength: 4, value: pinResetForm.confirmPin, onChange: (e) => setPinResetForm((p) => ({ ...p, confirmPin: e.target.value.replace(/\D/g, '') })), required: true })}
          <button type="submit" className="btn-staff-reset" disabled={resetSaving}>
            {resetSaving ? 'Resetting…' : 'Reset PIN'}
          </button>
        </form>
      </div>

      {/* Active Waiters */}
      <div className="staff-section">
        <div className="staff-section-title">Active Waiters</div>
        {loadingStaff ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading…</p>
        ) : activeWaiters.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>No active waiters.</p>
        ) : (
          activeWaiters.map((m) => (
            <div key={m.id} className="staff-member-row">
              <div className="staff-member-info">
                <div className="staff-member-name">{m.name}</div>
                <div className="staff-member-meta">
                  {m.username && <span className="staff-member-username">@{m.username}</span>}
                  <span style={{ marginLeft: m.username ? '0.4rem' : 0 }}>{m.phone}</span>
                </div>
              </div>
              <button className="btn-deactivate" onClick={() => setUserActive(m.id, false)}>Deactivate</button>
            </div>
          ))
        )}
      </div>

      {/* All Staff */}
      <details style={{ marginTop: '0.5rem' }}>
        <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
          All Staff ({staff.length})
        </summary>
        {staff.map((m) => (
          <div key={m.id} className="staff-member-row" style={{ opacity: m.active ? 1 : 0.5 }}>
            <div className="staff-member-info">
              <div className="staff-member-name">
                {m.name}
                <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#64748b' }}>
                  {ROLE_LABELS[m.role] || m.role}
                </span>
                {m.username && <span className="staff-member-username">@{m.username}</span>}
              </div>
              <div className="staff-member-meta">{m.phone} · {m.active ? 'Active' : 'Inactive'}</div>
            </div>
            {m.active ? (
              <button className="btn-deactivate" onClick={() => setUserActive(m.id, false)}>Deactivate</button>
            ) : (
              <button className="btn-reactivate" onClick={() => setUserActive(m.id, true)}>Reactivate</button>
            )}
          </div>
        ))}
      </details>
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
        Physical pagers are registered in the database (device code + MAC). Assign a free pager to a waiter for shift handover; only free pagers appear in the list.
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
            No pager devices in the database yet. After provisioning each ESP (serial MAC + device_code), insert rows into{' '}
            <code style={{ fontSize: '0.78rem' }}>pager_devices</code> (see Supabase SQL editor).
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Device code</th>
                  <th>MAC</th>
                  <th>Status</th>
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
                  onError={e => { e.target.src = 'https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=300&h=200&q=60'; }}
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
    { id: 'audit',         label: 'Audit Dashboard' },
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
            style={{ padding: '0.3rem 0.75rem', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}
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
        {activeTab === 'audit'         && <AuditTab />}
        {activeTab === 'inventory'     && <InventoryTab />}
        {activeTab === 'staff'         && <StaffTab currentUser={currentUser} />}
        {activeTab === 'pagers'        && <PagersTab currentUser={currentUser} />}
        {activeTab === 'tools'         && <ToolsTab currentUser={currentUser} />}
      </div>
    </div>
  );
}
