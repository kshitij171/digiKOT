import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { cancelService } from '../services/cancelService';

function fmtActionTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const year = d.getFullYear();
  const time = d.toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${day} ${mon} ${year}, ${time}`;
}

function kotShort(kotId) {
  if (!kotId) return '—';
  return '#' + String(kotId).slice(-4).toUpperCase();
}

function rowMatchesDateFilter(row, fromDate, toDate) {
  const iso = row.requestedAt;
  if (!fromDate && !toDate) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    if (t < from) return false;
  }
  if (toDate) {
    const to = new Date(`${toDate}T23:59:59.999`).getTime();
    if (t > to) return false;
  }
  return true;
}

function StatusBadge({ status }) {
  if (status === 'approved') {
    return <span className="cancel-kot-status cancel-kot-status--approved">Approved</span>;
  }
  if (status === 'rejected') {
    return <span className="cancel-kot-status cancel-kot-status--rejected">Rejected</span>;
  }
  return <span className="cancel-kot-status cancel-kot-status--pending">Pending</span>;
}

export default function CancelledKotsTab({ active = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await cancelService.listAllCancellationRequests();
      setRows(data || []);
      loadedOnce.current = true;
    } catch (e) {
      console.warn('CancelledKotsTab load error:', e);
      setError('Failed to load cancellation requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active || loadedOnce.current) return;
    load();
  }, [active, load]);

  const filteredRows = useMemo(
    () => rows.filter((row) => rowMatchesDateFilter(row, appliedFrom, appliedTo)),
    [rows, appliedFrom, appliedTo]
  );

  const handleApplyDates = (e) => {
    e.preventDefault();
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  const handleClearDates = () => {
    setDateFrom('');
    setDateTo('');
    setAppliedFrom('');
    setAppliedTo('');
  };

  const showInitialLoading = loading && rows.length === 0 && !error;

  return (
    <div className="cancel-kot-root">
      <div className="cancel-kot-header">
        <div>
          <div className="mod-section-title">Cancelled KOTs</div>
          <div className="mod-section-desc">
            All waiter cancellation requests and kitchen supervisor decisions.
          </div>
        </div>
        <button type="button" className="cancel-kot-refresh" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <form className="cancel-kot-filters" onSubmit={handleApplyDates}>
        <div>
          <label className="cancel-kot-filter-label" htmlFor="cancel-kot-from">From</label>
          <input
            id="cancel-kot-from"
            type="date"
            className="audit-date-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="cancel-kot-filter-label" htmlFor="cancel-kot-to">To</label>
          <input
            id="cancel-kot-to"
            type="date"
            className="audit-date-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <button type="submit" className="cancel-kot-apply" disabled={loading}>
          Apply
        </button>
        <button type="button" className="cancel-kot-clear" onClick={handleClearDates}>
          Clear
        </button>
      </form>

      {error && <p className="cancel-kot-error">{error}</p>}

      {showInitialLoading && <p className="mod-empty">Loading…</p>}

      {!showInitialLoading && !error && rows.length === 0 && (
        <p className="mod-empty">No cancellation requests yet.</p>
      )}

      {!showInitialLoading && !error && rows.length > 0 && filteredRows.length === 0 && (
        <p className="mod-empty">No cancellation requests match this date range.</p>
      )}

      {filteredRows.length > 0 && (
        <div className="cancel-kot-table-wrap">
          <table className="audit-table cancel-kot-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Item</th>
                <th>KOT</th>
                <th>Waiter</th>
                <th>Kitchen supervisor</th>
                <th>Status</th>
                <th>Action time</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>Table {row.tableNumber}</td>
                  <td>
                    {row.itemName} ×{row.qty}
                  </td>
                  <td className="mono">{kotShort(row.originalKotId)}</td>
                  <td>{row.waiterLabel}</td>
                  <td>{row.supervisorLabel}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="mono">{fmtActionTime(row.reviewedAt || row.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
