/**
 * Send restaurant bills via WhatsApp as native PDF attachments.
 *
 * Flow (Media Upload API — no public URL):
 *   1. generateBillPdf() → PDF buffer
 *   2. uploadMedia() → POST /{phone-number-id}/media → media_id
 *   3. sendBillTemplate() → header uses document.id = media_id
 */

import {
  buildBillPdfInputFromBillRecord,
  buildBillPdfInputFromClearedKots,
  formatAmountForWhatsApp,
  formatDateTimeForWhatsApp,
} from '../lib/billing/billPdfInput.js';
import { generateBillPdf } from '../lib/billing/generateBillPdf.js';
import { getWhatsAppConfig } from '../lib/whatsapp/config.js';
import { whatsappService } from './whatsappService.js';

const DEFAULT_CUSTOMER_NAME = 'sir/madam';
const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';
const PDF_MIME = 'application/pdf';

/**
 * @param {import('../lib/billing/billPdfInput.js').BillPdfInput} billPdfInput
 * @param {object} params
 * @param {string} params.customerName Template {{1}}
 * @param {ReturnType<typeof getWhatsAppConfig>} [params.config]
 */
export function buildBillTemplateBodyComponents(billPdfInput, { customerName, config }) {
  const cfg = config ?? getWhatsAppConfig();
  const name = (customerName || billPdfInput.customerName || DEFAULT_CUSTOMER_NAME).trim();
  const restaurant = billPdfInput.restaurantName || cfg.restaurantName;
  const total = formatAmountForWhatsApp(billPdfInput.total);
  const dateTime = formatDateTimeForWhatsApp(billPdfInput.createdAt);

  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name },
        { type: 'text', text: restaurant },
        { type: 'text', text: total },
        { type: 'text', text: dateTime },
      ],
    },
  ];
}

function pdfFilename(billPdfInput) {
  const table = billPdfInput.tableNumber ?? 'table';
  const shortId = billPdfInput.billId ? String(billPdfInput.billId).slice(-6) : Date.now();
  return `bill-table-${table}-${shortId}.pdf`;
}

/**
 * @param {import('../lib/billing/billPdfInput.js').BillPdfInput} billPdfInput
 * @param {string} mediaId From Media Upload API
 */
export function buildBillTemplateComponents(billPdfInput, { customerName, mediaId, config }) {
  const filename = pdfFilename(billPdfInput);
  return [
    whatsappService.buildDocumentHeaderComponent(mediaId, filename),
    ...buildBillTemplateBodyComponents(billPdfInput, { customerName, config }),
  ];
}

/**
 * Send bill PDF + template message to a customer (native PDF in WhatsApp).
 *
 * @param {object} params
 * @param {string} params.to Customer WhatsApp number (E.164, country code required)
 * @param {import('../lib/billing/billPdfInput.js').BillPdfInput} params.billPdfInput
 * @param {string} [params.customerName] Template {{1}} — defaults to sir/madam
 * @param {string} [params.languageCode] Must match Meta template locale (e.g. en_US)
 * @param {string} [params.outputPath] Optional path to also save the PDF locally
 */
export async function sendBillViaWhatsApp({
  to,
  billPdfInput,
  customerName,
  languageCode,
  outputPath,
}) {
  const config = getWhatsAppConfig();
  const lang = languageCode ?? config.templateLanguage ?? DEFAULT_TEMPLATE_LANGUAGE;
  const filename = pdfFilename(billPdfInput);

  // Step 1: Generate bill PDF in memory
  const { buffer } = await generateBillPdf(billPdfInput, { outputPath });

  // Step 2: Upload PDF to Meta Media API → media_id (not a link)
  const mediaId = await whatsappService.uploadMedia({
    buffer,
    mimeType: PDF_MIME,
    filename,
    config,
  });

  // Step 3: Send template with document header using media_id
  const components = buildBillTemplateComponents(billPdfInput, {
    customerName,
    mediaId,
    config,
  });

  const message = await whatsappService.sendBillTemplate({
    to,
    components,
    languageCode: lang,
    config,
  });

  return { message, mediaId, filename, pdfBytes: buffer.length };
}

export const billWhatsAppService = {
  buildBillPdfInputFromClearedKots,
  buildBillPdfInputFromBillRecord,
  buildBillTemplateBodyComponents,
  buildBillTemplateComponents,
  generateBillPdf,
  sendBillViaWhatsApp,
};
