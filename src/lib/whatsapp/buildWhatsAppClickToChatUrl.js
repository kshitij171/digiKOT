/**
 * WhatsApp Click to Chat — wa.me links with a pre-filled bill message.
 * No Cloud API; opens WhatsApp Web/App in the browser.
 */

const DEFAULT_RESTAURANT_NAME = 'OPULENCE Restaurant';

/**
 * Strip to local 10-digit Indian mobile (wa.me path uses separate 91 prefix).
 * @param {string} raw
 */
export function normalizeIndianMobileNumber(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  return digits;
}

function formatMoney(amount) {
  return Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBillDateTime(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Plain-text bill message for WhatsApp (not URL-encoded).
 *
 * @param {object} params
 * @param {string} [params.restaurantName]
 * @param {string|Date} [params.dateTime]
 * @param {Array<{ name: string, qty: number, unitPrice?: number, lineTotal?: number }>} params.items
 * @param {number} params.subtotal
 * @param {number} params.tax GST amount
 * @param {number} params.total
 * @param {number} [params.serviceCharge]
 */
export function buildBillWhatsAppMessage({
  restaurantName = DEFAULT_RESTAURANT_NAME,
  dateTime,
  items,
  subtotal,
  tax,
  total,
  serviceCharge = 0,
}) {
  const lines = [
    restaurantName,
    `Date & time: ${formatBillDateTime(dateTime)}`,
    '',
    'Itemised bill:',
  ];

  (items || []).forEach((item) => {
    const qty = Number(item.qty) || 0;
    const lineTotal =
      item.lineTotal != null
        ? Number(item.lineTotal)
        : qty * (Number(item.unitPrice) || Number(item.price) || 0);
    lines.push(`• ${item.name} × ${qty} — ₹${formatMoney(lineTotal)}`);
  });

  lines.push('');
  lines.push(`Subtotal: ₹${formatMoney(subtotal)}`);
  const svc = Number(serviceCharge) || 0;
  if (svc > 0) {
    lines.push(`Service charge: ₹${formatMoney(svc)}`);
  }
  lines.push(`GST: ₹${formatMoney(tax)}`);
  lines.push(`Total: ₹${formatMoney(total)}`);

  return lines.join('\n');
}

/**
 * https://wa.me/91{customerNumber}?text={encodedMessage}
 *
 * @param {object} params
 * @param {string} params.customerNumber 10-digit mobile (country code 91 added in path)
 * @param {string} params.message Plain text (will be URL-encoded)
 */
export function buildWhatsAppClickToChatUrl({ customerNumber, message }) {
  const local = normalizeIndianMobileNumber(customerNumber);
  if (local.length < 10) {
    throw new Error('Enter a valid 10-digit mobile number.');
  }

  const encoded = encodeURIComponent(message);
  return `https://wa.me/91${local}?text=${encoded}`;
}

/**
 * Build message + Click to Chat URL from billing totals.
 */
export function buildBillWhatsAppClickToChatUrl({
  customerNumber,
  restaurantName,
  dateTime,
  items,
  subtotal,
  tax,
  total,
  serviceCharge,
}) {
  const message = buildBillWhatsAppMessage({
    restaurantName:
      restaurantName ||
      import.meta.env.VITE_RESTAURANT_NAME ||
      DEFAULT_RESTAURANT_NAME,
    dateTime,
    items,
    subtotal,
    tax,
    total,
    serviceCharge,
  });

  return buildWhatsAppClickToChatUrl({ customerNumber, message });
}
