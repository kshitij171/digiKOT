/**
 * Device codes are used as MQTT topic segments (e.g. kot/pager/{code}/notify).
 * Lowercase slug: letter, then letters/digits/underscores, max 64 chars total.
 */
const DEVICE_CODE_REGEX = /^[a-z][a-z0-9_]{0,62}$/;

export function isValidDeviceCode(code) {
  return typeof code === 'string' && DEVICE_CODE_REGEX.test(code);
}

/** Default label when none provided (pager_12 → "Pager 12", else title-cased code). */
export function labelForDeviceCode(deviceCode) {
  const s = String(deviceCode || '').trim();
  const m = /^pager_(\d+)$/.exec(s);
  if (m) return `Pager ${Number(m[1])}`;
  if (!s) return 'Pager';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
