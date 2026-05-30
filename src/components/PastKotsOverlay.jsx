import React, { useState, useEffect, useCallback } from 'react';
import { kotService } from '../services/kotService';

const PAGE_SIZE = 20;

function formatCleared(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function ItemBadge({ status }) {
  if (status === 'done') return <span className="phk-badge phk-badge-served">Served</span>;
  if (status === 'out_of_stock' || status === 'removed')
    return <span className="phk-badge phk-badge-oos">Out of Stock</span>;
  if (status === 'cancelled') return <span className="phk-badge phk-badge-cancelled">Cancelled</span>;
  return <span className="phk-badge phk-badge-pending">{status}</span>;
}

export default function PastKotsOverlay({ supervisorId, onClose }) {
  const [kots, setKots] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p) => {
    console.log('PAST KOTs QUERY — supervisorId:', supervisorId);
    if (!supervisorId) {
      setKots([]);
      setTotal(0);
      setError('Supervisor session not found. Log out and sign in again with your PIN.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await kotService.listPastKots(supervisorId, p, PAGE_SIZE);
      console.log('PAST KOTs RESULT:', JSON.stringify(result, null, 2));
      setKots(result.kots);
      setTotal(result.total);
    } catch (e) {
      setError('Failed to load past KOTs. Please try again.');
      console.error('PastKotsOverlay load error:', e);
    } finally {
      setLoading(false);
    }
  }, [supervisorId]);

  // One-time fetch when overlay opens; pagination refetches only on page change
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supervisorId]);

  useEffect(() => {
    if (page > 1) load(page);
  }, [page, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="phk-overlay" role="dialog" aria-modal="true" aria-label="Past KOTs">
      <div className="phk-panel">
        {/* Header */}
        <div className="phk-header">
          <div className="phk-header-left">
            <h2 className="phk-title">Past KOTs</h2>
            <span className="phk-subtitle">Your cleared orders</span>
          </div>
          <button className="phk-close" onClick={onClose} aria-label="Close">✕ Close</button>
        </div>

        {/* Body */}
        <div className="phk-body">
          {loading && (
            <div className="phk-state">
              <div className="phk-spinner" />
              <p>Loading…</p>
            </div>
          )}

          {!loading && error && (
            <div className="phk-state phk-state-error">
              <p>{error}</p>
              <button className="phk-retry" onClick={() => load(page)}>Retry</button>
            </div>
          )}

          {!loading && !error && kots.length === 0 && (
            <div className="phk-state">
              <div className="phk-empty-icon">📭</div>
              <p>No cleared KOTs found for your session.</p>
            </div>
          )}

          {!loading && !error && kots.length > 0 && (
            <div className="phk-grid">
              {kots.map((kot) => {
                const shortId = '#' + kot.id.slice(-4).toUpperCase();
                return (
                  <div key={kot.id} className="phk-card">
                    <div className="phk-card-header">
                      <span className="phk-ref">{shortId}</span>
                      <span className="phk-table">Table {kot.tableNumber}</span>
                      {kot.waiterUsername && (
                        <span className="phk-waiter">Waiter: {kot.waiterUsername}</span>
                      )}
                      <span className="phk-cleared">{formatCleared(kot.clearedAt || kot.assignedAt)}</span>
                    </div>

                    {kot.specialInstructions && (
                      <div className="phk-note">📝 {kot.specialInstructions}</div>
                    )}

                    <ul className="phk-items">
                      {(kot.items || []).map((item, idx) => {
                        const isCancelled = item.status === 'cancelled';
                        return (
                          <li key={`${item.itemId}-${idx}`} className={`phk-item ${isCancelled ? 'phk-item-cancelled' : ''}`}>
                            <span className="phk-item-name">{item.name}</span>
                            <span className="phk-item-qty">×{item.qty}</span>
                            <ItemBadge status={item.status} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {!loading && !error && total > 0 && (
          <div className="phk-footer">
            <span className="phk-count">
              Showing {rangeStart}–{rangeEnd} of {total} KOTs
            </span>
            <div className="phk-pages">
              <button
                className="phk-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </button>
              <span className="phk-page-info">{page} / {totalPages}</span>
              <button
                className="phk-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
