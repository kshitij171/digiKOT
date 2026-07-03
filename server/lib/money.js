/** Money helpers: store as INTEGER paise, expose decimals to API/UI. */

export function toPaise(decimal) {
  if (decimal === null || decimal === undefined || decimal === '') return 0;
  const n = typeof decimal === 'number' ? decimal : parseFloat(String(decimal));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaise(paise) {
  if (paise === null || paise === undefined) return 0;
  return Number(paise) / 100;
}

export function toBps(percent) {
  if (percent === null || percent === undefined || percent === '') return null;
  const n = typeof percent === 'number' ? percent : parseFloat(String(percent));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

export function fromBps(bps) {
  if (bps === null || bps === undefined) return null;
  return Number(bps) / 100;
}

export function mapMenuItemRow(row) {
  if (!row) return row;
  return {
    ...row,
    price: fromPaise(row.price_paise),
    is_vegetarian: Boolean(row.is_vegetarian),
    out_of_stock: Boolean(row.out_of_stock),
  };
}

export function mapKotItemRow(row) {
  if (!row) return row;
  return {
    ...row,
    price_snapshot: fromPaise(row.price_snapshot_paise),
  };
}

export function mapBillRow(row) {
  if (!row) return row;
  return {
    ...row,
    subtotal: fromPaise(row.subtotal_paise),
    service_charge: fromPaise(row.service_charge_paise),
    tax: fromPaise(row.tax_paise),
    total: fromPaise(row.total_paise),
    discount_percent: fromBps(row.discount_percent_bps),
    printed: Boolean(row.printed),
  };
}

export function mapBillItemRow(row) {
  if (!row) return row;
  return {
    ...row,
    unit_price: fromPaise(row.unit_price_paise),
    line_total: fromPaise(row.line_total_paise),
    include_in_bill: Boolean(row.include_in_bill),
  };
}

export function mapUserRow(row) {
  if (!row) return row;
  return { ...row, active: Boolean(row.active) };
}
