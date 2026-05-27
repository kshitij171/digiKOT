/**
 * Generate a sample bill PDF (no WhatsApp).
 *
 *   node scripts/generate-bill-pdf.mjs
 *   node scripts/generate-bill-pdf.mjs tmp/my-bill.pdf
 */

import { buildBillPdfInputFromClearedKots } from '../src/lib/billing/billPdfInput.js';
import { generateBillPdf } from '../src/lib/billing/generateBillPdf.js';

const outputPath = process.argv[2] || 'tmp/sample-bill.pdf';

const input = buildBillPdfInputFromClearedKots({
  tableNumber: 12,
  restaurantName: 'OPULENCE Restaurant',
  waiterName: 'Waiter One',
  billId: 'demo-bill-001',
  clearedKots: [
    {
      id: 'kot-abc',
      items: [
        { itemId: '1', name: 'Butter Chicken', qty: 2, price: 320, status: 'done' },
        { itemId: '2', name: 'Dal Makhani', qty: 1, price: 280, status: 'done' },
        { itemId: '3', name: 'Garlic Naan', qty: 3, price: 55, status: 'done' },
      ],
    },
  ],
  serviceChargePct: 5,
  taxPct: 18,
  discountPercent: 10,
});

const { buffer, filePath } = await generateBillPdf(input, { outputPath });
console.log(`PDF written: ${filePath} (${buffer.length} bytes)`);
