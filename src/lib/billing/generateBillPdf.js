import fs from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * @typedef {import('./billPdfInput.js').BillPdfInput} BillPdfInput
 */

function fmt(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderBill(doc, input) {
  const {
    restaurantName,
    tableNumber,
    waiterName,
    billId,
    createdAt,
    items,
    subtotal,
    serviceCharge,
    serviceChargePct,
    tax,
    taxPct,
    discountPercent,
    discountAmount,
    total,
  } = input;

  const when = new Date(createdAt);

  doc.fontSize(20).font('Helvetica-Bold').text(restaurantName, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#444').text('Fine Dining Experience', { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica');
  const metaLeft = [
    `Table: ${tableNumber}`,
    waiterName ? `Waiter: ${waiterName}` : null,
    billId ? `Bill: ${String(billId).slice(-8).toUpperCase()}` : null,
  ].filter(Boolean);
  const metaRight = [
    `Date: ${when.toLocaleDateString('en-IN')}`,
    `Time: ${when.toLocaleTimeString('en-IN')}`,
  ];
  metaLeft.forEach((line) => doc.text(line, { continued: false }));
  doc.moveUp(metaLeft.length);
  metaRight.forEach((line, i) => {
    doc.text(line, { align: 'right' });
    if (i < metaRight.length - 1) doc.moveUp(1);
  });
  doc.moveDown(1);

  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).dash(3, { space: 3 }).stroke();
  doc.undash();
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Item', 50, doc.y, { width: 240 });
  doc.text('Qty × Rate', 290, doc.y, { width: 100 });
  doc.text('Amount', 400, doc.y, { width: 145, align: 'right' });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9);

  for (const item of items) {
    const y = doc.y;
    doc.text(item.name, 50, y, { width: 230 });
    doc.text(`${item.qty} × ${fmt(item.unitPrice)}`, 290, y, { width: 100 });
    doc.text(fmt(item.lineTotal), 400, y, { width: 145, align: 'right' });
    doc.moveDown(0.35);
  }

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(0.5);

  const totalsX = 320;
  const valueX = 400;
  const row = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    doc.text(label, totalsX, doc.y, { width: 75 });
    doc.text(value, valueX, doc.y, { width: 145, align: 'right' });
    doc.moveDown(0.25);
  };

  row('Subtotal:', fmt(subtotal));
  if (serviceChargePct != null) {
    row(`Service (${serviceChargePct}%):`, fmt(serviceCharge));
  } else {
    row('Service charge:', fmt(serviceCharge));
  }
  if (taxPct != null) {
    row(`GST (${taxPct}%):`, fmt(tax));
  } else {
    row('Tax:', fmt(tax));
  }
  if (discountPercent != null && discountPercent > 0) {
    row(`Discount (${discountPercent}%):`, `−${fmt(discountAmount ?? 0)}`);
  }
  row('Grand Total:', fmt(total), true);

  doc.moveDown(1.5);
  doc.fontSize(9).font('Helvetica').fillColor('#555').text('Thank you for dining with us!', { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(0.5);
  doc.fontSize(8).text('Powered by digiKOT', { align: 'center' });
}

/**
 * Generate a customer bill PDF.
 *
 * @param {BillPdfInput} input Normalized bill data (see billPdfInput.js builders)
 * @param {{ outputPath?: string }} [options] If outputPath is set, writes the file and returns its path
 * @returns {Promise<{ buffer: Buffer, filePath?: string }>}
 */
export async function generateBillPdf(input, options = {}) {
  if (!input?.items?.length) {
    throw new Error('Bill has no line items to include in the PDF.');
  }

  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      renderBill(doc, input);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });

  const { outputPath } = options;
  if (!outputPath) {
    return { buffer };
  }

  const resolved = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, buffer);
  return { buffer, filePath: resolved };
}
