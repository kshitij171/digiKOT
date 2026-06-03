/**
 * Client for the local WhatsApp bill API (Vite middleware in dev/preview).
 * Customer phone/name are sent once and not stored by this client.
 */

export async function requestSendBillOnWhatsApp({
  billId,
  tableNumber,
  clearedKots,
  serviceChargePct,
  taxPct,
  discountPercent,
  waiterName,
  customerPhone,
  customerName,
}) {
  try {
    const res = await fetch('/api/whatsapp/send-bill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billId,
        tableNumber,
        clearedKots,
        serviceChargePct,
        taxPct,
        discountPercent,
        waiterName,
        customerPhone,
        customerName: customerName?.trim() || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `WhatsApp send failed (${res.status})`);
    }
    return data;
  } catch (err) {
    throw err;
  }
}
