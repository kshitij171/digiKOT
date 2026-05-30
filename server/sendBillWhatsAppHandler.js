import { buildBillPdfInputFromClearedKots } from '../src/lib/billing/billPdfInput.js';
import { isWhatsAppConfigured, getWhatsAppConfig } from '../src/lib/whatsapp/config.js';
import { billWhatsAppService } from '../src/services/billWhatsAppService.js';
import { whatsappService } from '../src/services/whatsappService.js';

const FALLBACK_NAME = 'sir/madam';

/**
 * @param {object} body
 * @param {string} body.billId
 * @param {number} body.tableNumber
 * @param {Array} body.clearedKots
 * @param {number} [body.serviceChargePct]
 * @param {number} [body.taxPct]
 * @param {number} [body.discountPercent]
 * @param {string} [body.waiterName]
 * @param {string} body.customerPhone digits only, with country code
 * @param {string} [body.customerName]
 */
export async function sendBillWhatsAppFromPayload(body) {
  if (!isWhatsAppConfigured()) {
    throw new Error('WhatsApp is not configured. Set WHATSAPP_* variables in .env.');
  }

  const phone = whatsappService.normalizeRecipientPhone(body.customerPhone);
  if (phone.length < 10) {
    throw new Error('Enter a valid phone number with country code (e.g. 91XXXXXXXXXX).');
  }

  if (!body.clearedKots?.length) {
    throw new Error('No billable items on this table.');
  }

  const config = getWhatsAppConfig();
  const displayName = body.customerName?.trim() || FALLBACK_NAME;

  const billPdfInput = buildBillPdfInputFromClearedKots({
    tableNumber: body.tableNumber,
    clearedKots: body.clearedKots,
    serviceChargePct: body.serviceChargePct ?? 5,
    taxPct: body.taxPct ?? 18,
    discountPercent: body.discountPercent ?? 0,
    waiterName: body.waiterName,
    billId: body.billId,
    restaurantName: config.restaurantName,
    customerName: displayName,
  });

  return billWhatsAppService.sendBillViaWhatsApp({
    to: phone,
    customerName: displayName,
    billPdfInput,
    languageCode: config.templateLanguage,
  });
}
