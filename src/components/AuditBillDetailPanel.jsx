import React from 'react';
import './AuditBillDetailPanel.css';

function fmtAmt(n) {
  return `₹${Number(n).toFixed(2)}`;
}

/** Prefer normalized name from auditBillDetailService; tolerate legacy/alternate keys */
function itemDisplayLabel(line) {
  const v =
    line.displayName ??
    line.name ??
    line.itemName ??
    line.item_name ??
    line.title;
  if (v != null && String(v).trim() !== '') return String(v).trim();
  return 'Unknown item';
}

function Dots() {
  return <span className="audit-bill-dots">{'·'.repeat(28)}</span>;
}

export default function AuditBillDetailPanel({ pct, auditBill }) {
  if (!auditBill || auditBill.error) {
    return <p className="audit-bill-error">{auditBill?.error || 'Unable to load bill detail.'}</p>;
  }

  const { bill, lines, totals } = auditBill;

  return (
    <div className="audit-bill-panel">
      {pct != null && pct === 100 && (
        <div className="audit-feed-waiver audit-bill-waiver">100% DISCOUNT — FULL WAIVER</div>
      )}

      <div className="audit-bill-meta">
        <span className="audit-bill-meta-strong">Bill {bill.shortId}</span>
        <span className="audit-bill-meta-muted">·</span>
        <span>Table {bill.tableNumber}</span>
        {bill.waiterUsername && (
          <>
            <span className="audit-bill-meta-muted">·</span>
            <span>@{bill.waiterUsername}</span>
          </>
        )}
        {bill.billStatus && (
          <>
            <span className="audit-bill-meta-muted">·</span>
            <span className={`audit-bill-status audit-bill-status--${bill.billStatus}`}>{bill.billStatus}</span>
          </>
        )}
        {bill.discountAppliedByLabel && totals.discountPercent > 0 && (
          <>
            <span className="audit-bill-meta-muted">·</span>
            <span>Discount by {bill.discountAppliedByLabel}</span>
          </>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="audit-bill-empty">No kitchen line items found for this session.</p>
      ) : (
        <ul className="audit-bill-lines">
          {lines.map((line, idx) => (
            <li key={idx} className={`audit-bill-line audit-bill-line--${line.kind}`}>
              {line.kind === 'served' && (
                <>
                  <div className="audit-bill-line-main">
                    <span className="audit-bill-line-title-col">
                      <span className="audit-bill-line-name">{itemDisplayLabel(line)}</span>
                      <span className="audit-bill-line-qty">
                        {' '}× {line.qty}{' '}
                        <span className="audit-bill-kot">({line.kotLabel})</span>
                      </span>
                    </span>
                    <Dots />
                    <span className="audit-bill-line-amt">{fmtAmt(line.lineTotal)}</span>
                  </div>
                </>
              )}

              {line.kind === 'partial' && (
                <>
                  <div className="audit-bill-line-main">
                    <span className="audit-bill-line-title-col">
                      <span className="audit-bill-line-name">{itemDisplayLabel(line)}</span>
                      <span className="audit-bill-line-qty">
                        {' '}× {line.qty}{' '}
                        <span className="audit-bill-kot">({line.kotLabel})</span>
                      </span>
                    </span>
                    <Dots />
                    <span className="audit-bill-line-amt">{fmtAmt(line.lineTotal)}</span>
                  </div>
                  <div className="audit-bill-line-sub">
                    ↳ {line.originalQty - line.qty} removed (approved by {line.managerName || 'manager'})
                  </div>
                  <div className="audit-bill-line-sub muted">
                    originally × {line.originalQty}
                  </div>
                </>
              )}

              {line.kind === 'removed_full' && (
                <>
                  <div className="audit-bill-line-main struck">
                    <span className="audit-bill-line-title-col">
                      <span className="audit-bill-line-name">{itemDisplayLabel(line)}</span>
                      <span className="audit-bill-line-qty">
                        {' '}× {line.qty}{' '}
                        <span className="audit-bill-kot">({line.kotLabel})</span>
                      </span>
                    </span>
                    <Dots />
                    <span className="audit-bill-line-amt muted">{fmtAmt(0)}</span>
                  </div>
                  <div className="audit-bill-line-sub">
                    ↳ Removed (approved by {line.managerName || 'manager'})
                  </div>
                </>
              )}

              {line.kind === 'oos' && (
                <>
                  <div className="audit-bill-line-main struck">
                    <span className="audit-bill-line-title-col">
                      <span className="audit-bill-line-name">{itemDisplayLabel(line)}</span>
                      <span className="audit-bill-line-qty">
                        {' '}× {line.qty}{' '}
                        <span className="audit-bill-kot">({line.kotLabel})</span>
                      </span>
                    </span>
                    <Dots />
                    <span className="audit-bill-line-amt muted">{fmtAmt(0)}</span>
                  </div>
                  <div className="audit-bill-line-sub">↳ Out of stock at kitchen</div>
                </>
              )}

              {line.kind === 'cancelled' && (
                <>
                  <div className="audit-bill-line-main struck">
                    <span className="audit-bill-line-title-col">
                      <span className="audit-bill-line-name">{itemDisplayLabel(line)}</span>
                      <span className="audit-bill-line-qty">
                        {' '}× {line.qty}{' '}
                        <span className="audit-bill-kot">({line.kotLabel})</span>
                      </span>
                    </span>
                    <Dots />
                    <span className="audit-bill-line-amt muted">{fmtAmt(0)}</span>
                  </div>
                  <div className="audit-bill-line-sub">↳ Cancelled</div>
                </>
              )}

              {line.kind === 'other' && (
                <div className="audit-bill-line-main">
                  <span className="audit-bill-line-title-col">
                    <span className="audit-bill-line-name">{itemDisplayLabel(line)}</span>
                    <span className="audit-bill-line-qty">
                      {' '}× {line.qty}{' '}
                      <span className="audit-bill-kot">({line.kotLabel})</span>
                      <span className="audit-bill-meta-muted"> [{line.status}]</span>
                    </span>
                  </span>
                  <Dots />
                  <span className="audit-bill-line-amt">{fmtAmt(line.lineTotal)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="audit-bill-totals">
        <div className="audit-bill-total-row">
          <span>Subtotal (served + partial at final qty)</span>
          <span>{fmtAmt(totals.billableSubtotal)}</span>
        </div>
        {totals.removedAmount > 0 && (
          <div className="audit-bill-total-row removed">
            <span>Items removed</span>
            <span>−{fmtAmt(totals.removedAmount)}</span>
          </div>
        )}
        <div className="audit-bill-total-row">
          <span>Service charge</span>
          <span>{fmtAmt(totals.serviceCharge)}</span>
        </div>
        <div className="audit-bill-total-row">
          <span>GST</span>
          <span>{fmtAmt(totals.tax)}</span>
        </div>
        {totals.discountPercent > 0 && (
          <div className="audit-bill-total-row">
            <span>Discount ({totals.discountPercent}%)</span>
            <span>−{fmtAmt(totals.preDiscount * (totals.discountPercent / 100))}</span>
          </div>
        )}
        <div className="audit-bill-total-row grand">
          <span>Grand total (audit)</span>
          <span>{fmtAmt(totals.grandTotal)}</span>
        </div>
      </div>

      <p className="audit-bill-footnote">
        Annotated reconstruction from KOT lines — customer receipt shows billable items only.
      </p>
    </div>
  );
}
