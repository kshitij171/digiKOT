import React, { useState, useCallback, useMemo } from 'react';
import { auditService } from '../services/auditService';
import {
  getFeedCategories,
  isFeedEntry,
  collapsedSummaryLine,
  collapsedIcon,
  loadExpandedDetail,
} from '../services/auditFeedService';
import AuditBillDetailPanel from './AuditBillDetailPanel';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDateStr(daysDelta) {
  const d = new Date();
  d.setDate(d.getDate() + daysDelta);
  return d.toISOString().slice(0, 10);
}

function toFrom(dateStr) {
  return dateStr ? new Date(dateStr + 'T00:00:00').toISOString() : null;
}

function toTo(dateStr) {
  return dateStr ? new Date(dateStr + 'T23:59:59').toISOString() : null;
}

function computeIso(preset, customFrom, customTo) {
  const today = todayStr();
  if (preset === 'custom') {
    return { fromIso: toFrom(customFrom), toIso: toTo(customTo) };
  }
  if (preset === 'today') return { fromIso: toFrom(today), toIso: toTo(today) };
  if (preset === 'yesterday') {
    const y = offsetDateStr(-1);
    return { fromIso: toFrom(y), toIso: toTo(y) };
  }
  if (preset === 'last7') {
    return { fromIso: toFrom(offsetDateStr(-6)), toIso: toTo(today) };
  }
  return { fromIso: toFrom(today), toIso: toTo(today) };
}

const DEFAULT_FILTERS = {
  cancel_kot: true,
  bill_mod_reject: true,
  discount_gt50: true,
  discount_100: true,
};

const CAT_KEYS = ['cancel_kot', 'bill_mod_reject', 'discount_gt50', 'discount_100'];
const CAT_LABELS = {
  cancel_kot: 'Cancel KOT',
  bill_mod_reject: 'Bill removal reject',
  discount_gt50: 'Discounts above 50%',
  discount_100: 'Discounts of 100%',
};

function passesFilters(log, filters) {
  const cats = getFeedCategories(log);
  if (!cats.length) return false;
  return cats.some((c) => filters[c]);
}

export default function AuditFeedTab() {
  // ── Draft filter controls (what the user is editing) ──────
  const [preset, setPreset] = useState('today');
  // Split customRange into two primitives to avoid object-identity re-renders
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);

  // ── Category filters (client-side, instant — no refetch) ──
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // ── Data ──────────────────────────────────────────────────
  const [rawLogs, setRawLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // True only after the user has clicked Apply at least once.
  // Until then we show a placeholder instead of "no results".
  const [hasFetched, setHasFetched] = useState(false);

  // ── Expand state ──────────────────────────────────────────
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);

  // ── Apply (the ONLY trigger for a data fetch) ─────────────
  const applyFilters = useCallback(async () => {
    const { fromIso, toIso } = computeIso(preset, customFrom, customTo);
    setLoading(true);
    setError('');
    setExpandedId(null);
    try {
      const data = await auditService.listByDate({ fromDate: fromIso, toDate: toIso });
      setRawLogs(data || []);
      setHasFetched(true);
    } catch (e) {
      console.warn(e);
      setError('Unable to load the audit feed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  // Clear resets controls + data but does NOT auto-fetch — user must Apply again.
  const clearFilters = useCallback(() => {
    const today = todayStr();
    setPreset('today');
    setCustomFrom(today);
    setCustomTo(today);
    setFilters(DEFAULT_FILTERS);
    setRawLogs([]);
    setHasFetched(false);
    setExpandedId(null);
    setError('');
  }, []);

  const toggleFilter = useCallback((key) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  }, []);

  // ── Derived visible list ──────────────────────────────────
  const visibleLogs = useMemo(
    () => (rawLogs || []).filter((log) => isFeedEntry(log) && passesFilters(log, filters)),
    [rawLogs, filters],
  );

  // Stable draft iso — depends only on primitives, not object literals
  const draftIso = useMemo(
    () => computeIso(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const todayIso = useMemo(() => computeIso('today', '', ''), []);
  const hasPendingDateChange = hasFetched && (
    draftIso.fromIso !== todayIso.fromIso || draftIso.toIso !== todayIso.toIso
  );

  const activeFilterCount = useMemo(() => {
    if (!hasFetched) return 0;
    return CAT_KEYS.filter((k) => !filters[k]).length;
  }, [filters, hasFetched]);

  // ── Expand/collapse ───────────────────────────────────────
  const handleRowClick = async (log) => {
    if (expandedId === log.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(log.id);
    if (!detailCache[log.id]) {
      setDetailLoading(log.id);
      try {
        const detail = await loadExpandedDetail(log);
        setDetailCache((c) => ({ ...c, [log.id]: detail }));
      } catch (e) {
        console.warn(e);
        setDetailCache((c) => ({
          ...c,
          [log.id]: { type: 'error', error: 'Could not load details.' },
        }));
      } finally {
        setDetailLoading(null);
      }
    }
  };

  return (
    <div className="audit-feed-root">
      <div className="audit-feed-toolbar">
        {/* Date presets */}
        <div className="audit-feed-date-presets">
          <span className="audit-feed-toolbar-label">Date</span>
          {[
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['last7', 'Last 7 days'],
            ['custom', 'Custom range'],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`audit-feed-pill ${preset === val ? 'active' : ''}`}
              onClick={() => setPreset(val)}
            >
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="audit-feed-custom-dates">
              <input
                type="date"
                className="audit-date-input"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="audit-date-sep">→</span>
              <input
                type="date"
                className="audit-date-input"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </span>
          )}
          <button
            type="button"
            className={`audit-feed-apply-btn ${hasPendingDateChange ? 'pending' : ''}`}
            onClick={applyFilters}
            disabled={loading}
          >
            {loading ? 'Loading…' : hasPendingDateChange ? 'Apply ●' : 'Apply'}
          </button>
        </div>

        {/* Category filters (instant — no refetch) */}
        <div className="audit-feed-categories">
          <span className="audit-feed-toolbar-label">Show</span>
          {CAT_KEYS.map((key) => (
            <label key={key} className="audit-feed-cat-toggle">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={() => toggleFilter(key)}
              />
              <span>{CAT_LABELS[key]}</span>
            </label>
          ))}
        </div>

        {/* Meta row */}
        <div className="audit-feed-meta-row">
          <span className="audit-feed-count">
            Showing {visibleLogs.length} entr{visibleLogs.length !== 1 ? 'ies' : 'y'}
            {activeFilterCount > 0
              ? ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} active`
              : ''}
          </span>
          <button type="button" className="audit-feed-clear-btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </div>

      {error && <p className="audit-feed-banner-error">{error}</p>}

      {!hasFetched ? (
        <p className="audit-empty audit-empty-placeholder">
          Select filters and click <strong>Apply</strong> to view the audit log.
        </p>
      ) : loading ? (
        <p className="audit-empty">Loading…</p>
      ) : visibleLogs.length === 0 ? (
        <p className="audit-empty">No audit entries match your filters.</p>
      ) : (
        <div className="audit-feed-list">
          {visibleLogs.map((log) => {
            const summaryLine = collapsedSummaryLine(log);
            const { text, time, extraLines } = summaryLine;
            const open = expandedId === log.id;
            const detail = detailCache[log.id];
            const loadingD = detailLoading === log.id;

            return (
              <div key={log.id} className={`audit-feed-row-wrap ${open ? 'open' : ''}`}>
                <button
                  type="button"
                  className="audit-feed-row"
                  onClick={() => handleRowClick(log)}
                  aria-expanded={open}
                >
                  <span className="audit-feed-icon">{collapsedIcon(log)}</span>
                  <span className="audit-feed-summary-cell">
                    <span className="audit-feed-summary">{text}</span>
                    {(extraLines || []).map((line, idx) => (
                      <span
                        key={idx}
                        className={`audit-feed-extra ${line.italic ? 'italic' : ''} ${line.muted !== false ? 'muted' : ''}`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </span>
                  <span className="audit-feed-time">{time}</span>
                  <span className="audit-feed-chevron" aria-hidden>
                    {open ? '▲' : '▼'}
                  </span>
                </button>
                <div className="audit-feed-expand-panel" aria-hidden={!open}>
                  <div className="audit-feed-expand-inner">
                    {open && (
                      <>
                        {loadingD && <p className="audit-feed-detail-muted">Loading details…</p>}
                        {!loadingD && detail?.error && (
                          <p className="audit-feed-detail-error">{detail.error}</p>
                        )}
                        {!loadingD && detail?.type === 'bill_mod_reject' && (
                          <div className="audit-feed-mod-reject-detail">
                            <p className="audit-feed-summary">{detail.headline}</p>
                            <p className="audit-feed-extra muted italic">Reason: {detail.reasonLine}</p>
                            <p className="audit-feed-detail-muted">{detail.rejectedLine}</p>
                          </div>
                        )}
                        {!loadingD && detail?.type === 'audit_bill' && (
                          <AuditBillDetailPanel pct={detail.pct} auditBill={detail.auditBill} />
                        )}
                        {!loadingD && detail?.fields && detail?.type !== 'audit_bill' && detail?.type !== 'bill_mod_reject' && (
                          <>
                            {detail.type === 'discount' && detail.pct === 100 && (
                              <div className="audit-feed-waiver">100% DISCOUNT — FULL WAIVER</div>
                            )}
                            <dl className="audit-feed-dl">
                              {Object.entries(detail.fields).map(([k, v]) => (
                                <div key={k} className="audit-feed-dl-row">
                                  <dt>{k}</dt>
                                  <dd>{v}</dd>
                                </div>
                              ))}
                            </dl>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
