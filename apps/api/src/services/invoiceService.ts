import fs from 'node:fs';
import path from 'node:path';

import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';

import { prisma } from '../lib/prisma.js';

type Money = string | number | Prisma.Decimal;

const D = (value: Money) => new Prisma.Decimal(value);
const round2 = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

// Optional: put NotoSans-Regular.ttf here to print the ₹ symbol. Without it, "Rs." is used.
const FONT_PATH = path.resolve(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf');

const RESTAURANT = {
  name: process.env.RESTAURANT_NAME ?? 'Tavola',
  address: process.env.RESTAURANT_ADDRESS ?? '',
  gstin: process.env.RESTAURANT_GSTIN ?? '',
};

export async function streamInvoicePdf(orderId: string, res: Response) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      table: { select: { number: true } },
      coupon: { select: { code: true } },
      items: { include: { menuItem: { select: { name: true } }, addons: true } },
      payments: { where: { status: 'PAID' } },
    },
  });

  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (order.status !== 'COMPLETED') throw new Error('ORDER_NOT_COMPLETED');

  // Build line items and the GST breakup per slab (uses the tax % saved on each order item).
  const slabs = new Map<string, { taxable: Prisma.Decimal; tax: Prisma.Decimal }>();
  const lines = order.items.map((item) => {
    const addonPerUnit = item.addons.reduce((sum, addon) => sum.plus(addon.price), D(0));
    const unit = item.unitPrice.plus(addonPerUnit);
    const lineTotal = unit.times(item.quantity);
    const lineTax = round2(lineTotal.times(item.taxPercent).div(100));

    const key = item.taxPercent.toFixed(2);
    const slab = slabs.get(key) ?? { taxable: D(0), tax: D(0) };
    slab.taxable = slab.taxable.plus(lineTotal);
    slab.tax = slab.tax.plus(lineTax);
    slabs.set(key, slab);

    return {
      name: item.menuItem.name,
      extras: item.addons.map((addon) => addon.addonName).join(', '),
      quantity: item.quantity,
      unit,
      lineTotal,
    };
  });

  // B-18: the per-line tax here is recomputed from snapshots and can drift a paise or
  // two from the stored order.taxAmount (which is authoritative). Reconcile by pushing
  // the rounding difference onto the largest slab so the printed GST breakup always
  // sums to exactly the tax that was charged.
  if (slabs.size > 0) {
    const recomputed = [...slabs.values()].reduce((sum, slab) => sum.plus(slab.tax), D(0));
    const drift = round2(order.taxAmount).minus(recomputed);
    if (!drift.isZero()) {
      let largestKey = '';
      let largestTaxable = D(-1);
      for (const [key, slab] of slabs) {
        if (slab.taxable.gte(largestTaxable)) { largestTaxable = slab.taxable; largestKey = key; }
      }
      const slab = slabs.get(largestKey)!;
      slab.tax = slab.tax.plus(drift);
      slabs.set(largestKey, slab);
    }
  }

  const hasFont = fs.existsSync(FONT_PATH);
  const money = (value: Prisma.Decimal) => `${hasFont ? '₹' : 'Rs. '}${value.toFixed(2)}`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');

  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  doc.pipe(res);

  if (hasFont) doc.registerFont('body', FONT_PATH);
  const setFont = (bold = false) => doc.font(hasFont ? 'body' : bold ? 'Helvetica-Bold' : 'Helvetica');

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  const rule = () => {
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#CCCCCC').stroke();
    doc.moveDown(0.5);
  };

  // Generic row: left label, right value
  const row = (label: string, value: string, bold = false, size = 9) => {
    const y = doc.y;
    setFont(bold).fontSize(size);
    const h = Math.max(
      doc.heightOfString(label, { width: width - 90 }),
      doc.heightOfString(value, { width: 90 }),
    );
    doc.text(label, left, y, { width: width - 90 });
    doc.text(value, right - 90, y, { width: 90, align: 'right' });
    doc.y = y + h + 3;
  };

  // Item row: name | qty | rate | amount
  const itemRow = (name: string, qty: string, rate: string, amount: string, bold = false) => {
    const y = doc.y;
    const nameW = width - 160;
    setFont(bold).fontSize(9);
    const h = doc.heightOfString(name, { width: nameW });
    doc.text(name, left, y, { width: nameW });
    doc.text(qty, left + nameW, y, { width: 30, align: 'right' });
    doc.text(rate, left + nameW + 30, y, { width: 60, align: 'right' });
    doc.text(amount, left + nameW + 90, y, { width: 70, align: 'right' });
    doc.y = y + h + 3;
  };

  // ── Header ──
  setFont(true).fontSize(18).text(RESTAURANT.name, left, doc.y, { width, align: 'center' });
  setFont().fontSize(8);
  if (RESTAURANT.address) doc.text(RESTAURANT.address, { width, align: 'center' });
  if (RESTAURANT.gstin) doc.text(`GSTIN: ${RESTAURANT.gstin}`, { width, align: 'center' });
  doc.moveDown(0.5);
  setFont(true).fontSize(11).text('TAX INVOICE', { width, align: 'center' });
  doc.moveDown(0.5);
  rule();

  const when = order.updatedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  row('Invoice no.', `INV-${order.orderNumber}`);
  row('Date', when);
  row('Table', order.table ? String(order.table.number) : order.type === 'TAKEAWAY' ? 'Takeaway' : 'Walk-in');
  doc.moveDown(0.3);
  rule();

  // ── Items ──
  itemRow('Item', 'Qty', 'Rate', 'Amount', true);
  rule();
  for (const line of lines) {
    itemRow(line.name, String(line.quantity), money(line.unit), money(line.lineTotal));
    if (line.extras) {
      setFont().fontSize(7.5).fillColor('#666666').text(`+ ${line.extras}`, left + 8, doc.y - 1, { width: width - 8 });
      doc.fillColor('#000000').moveDown(0.2);
    }
  }
  rule();

  // ── Totals ──
  row('Subtotal', money(order.subtotal));
  for (const [rate, slab] of [...slabs.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const half = D(rate).div(2).toString();
    const cgst = round2(slab.tax.div(2));
    const sgst = slab.tax.minus(cgst);
    row(`CGST @ ${half}% on ${money(slab.taxable)}`, money(cgst), false, 8);
    row(`SGST @ ${half}% on ${money(slab.taxable)}`, money(sgst), false, 8);
  }
  if (order.discount.gt(0)) {
    row(order.coupon ? `Discount (${order.coupon.code})` : 'Discount', `- ${money(order.discount)}`);
  }
  rule();
  row('TOTAL', money(order.total), true, 12);
  doc.moveDown(0.3);

  // ── Payments ──
  setFont(true).fontSize(9).text('Paid by', left, doc.y);
  for (const payment of order.payments) row(payment.method, money(payment.amount));

  doc.moveDown(1);
  setFont().fontSize(8).fillColor('#666666').text('Thank you for dining with us!', left, doc.y, { width, align: 'center' });

  doc.end();
}