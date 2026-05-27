/**
 * Test: generate bill PDF and send via WhatsApp template.
 *
 * Usage (from project root):
 *   node --env-file=.env scripts/send-bill-whatsapp.mjs --to 919876543210 --name "Rajesh"
 *
 * Optional: load bill from DB by id (requires Supabase env in .env):
 *   node --env-file=.env scripts/send-bill-whatsapp.mjs --to 919... --bill-id <uuid>
 */

import { billWhatsAppService } from '../src/services/billWhatsAppService.js';
import { billingRepository } from '../src/repositories/billingRepository.js';
import { getWhatsAppConfig } from '../src/lib/whatsapp/config.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to') out.to = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--bill-id') out.billId = argv[++i];
    else if (a === '--lang') out.lang = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.to) {
  console.error('Missing --to <E.164 phone, e.g. 919876543210>');
  process.exit(1);
}

const config = getWhatsAppConfig();
const languageCode = args.lang || process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';

let billPdfInput;

if (args.billId) {
  const bill = await billingRepository.getBillById(args.billId);
  if (!bill) throw new Error(`Bill not found: ${args.billId}`);
  const billItems = await billingRepository.getBillItems(args.billId);
  billPdfInput = billWhatsAppService.buildBillPdfInputFromBillRecord({
    bill,
    billItems,
    restaurantName: config.restaurantName,
    customerName: args.name,
  });
} else {
  billPdfInput = billWhatsAppService.buildBillPdfInputFromClearedKots({
    tableNumber: 5,
    restaurantName: config.restaurantName,
    customerName: args.name,
    waiterName: 'Demo Waiter',
    clearedKots: [
      {
        id: 'demo-kot-1',
        items: [
          { itemId: '1', name: 'Butter Chicken', qty: 2, price: 320, status: 'done' },
          { itemId: '2', name: 'Naan', qty: 4, price: 45, status: 'done' },
        ],
      },
    ],
    serviceChargePct: 5,
    taxPct: 18,
    discountPercent: 0,
  });
}

const result = await billWhatsAppService.sendBillViaWhatsApp({
  to: args.to,
  customerName: args.name,
  billPdfInput,
  languageCode,
  outputPath: `tmp/bill-${billPdfInput.tableNumber}.pdf`,
});

console.log('Sent:', result);
