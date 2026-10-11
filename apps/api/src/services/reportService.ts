import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

const DEFAULT_RANGE_DAYS = 30;
const COMPLETED_ORDER_FILTER = { status: 'COMPLETED' as const };

export type ReportRange = {
  from?: string;
  to?: string;
  limit?: number;
};

const getDateBounds = (from?: string, to?: string) => {
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Report dates must use YYYY-MM-DD format.');
  }

  if (start > end) {
    throw new Error('Start date must be earlier than or equal to the end date.');
  }

  return { start, end };
};

const asDecimal = (value: Prisma.Decimal | null | undefined) => new Prisma.Decimal(value?.toString() ?? '0');
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);

export async function getSummary(range: ReportRange) {
  const { start, end } = getDateBounds(range.from, range.to);
  const completedWhere = { ...COMPLETED_ORDER_FILTER, createdAt: { gte: start, lte: end } };

  const [revenueResult, orders, distinctTables] = await Promise.all([
    prisma.order.aggregate({
      where: completedWhere,
      _sum: { total: true, taxAmount: true },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: completedWhere,
      select: { total: true, tableId: true },
    }),
    prisma.order.findMany({
      where: completedWhere,
      select: { tableId: true },
      distinct: ['tableId'],
    }),
  ]);

  const revenue = asDecimal(revenueResult._sum.total);
  const tax = asDecimal(revenueResult._sum.taxAmount);
  const totalOrders = revenueResult._count?._all ?? 0;
  const averageOrderValue = totalOrders > 0 ? revenue.div(totalOrders) : new Prisma.Decimal(0);

  return {
    range: {
      from: start.toISOString(),
      to: end.toISOString(),
    },
    totalRevenue: money(revenue),
    totalTax: money(tax),
    totalOrders,
    averageOrderValue: money(averageOrderValue),
    tablesServed: distinctTables.length,
    ordersToday: orders.length,
  };
}

export async function getDailySales(range: ReportRange) {
  const { start, end } = getDateBounds(range.from, range.to);

  const orders = await prisma.order.findMany({
    where: { ...COMPLETED_ORDER_FILTER, createdAt: { gte: start, lte: end } },
    select: { createdAt: true, total: true },
    orderBy: { createdAt: 'asc' },
  });

  const map = new Map<string, { date: string; revenue: Prisma.Decimal; orders: number }>();

  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    const existing = map.get(key) ?? { date: key, revenue: new Prisma.Decimal(0), orders: 0 };
    existing.revenue = existing.revenue.plus(order.total);
    existing.orders += 1;
    map.set(key, existing);
  }

  return Array.from(map.values()).map((entry) => ({
    date: entry.date,
    revenue: money(entry.revenue),
    orders: entry.orders,
  }));
}

export async function getTopItems(range: ReportRange) {
  const { start, end } = getDateBounds(range.from, range.to);
  const limit = range.limit ?? 5;

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        ...COMPLETED_ORDER_FILTER,
        createdAt: { gte: start, lte: end },
      },
    },
    select: {
      menuItem: { select: { name: true } },
      quantity: true,
      unitPrice: true,
      addons: { select: { price: true } },
    },
  });

  const totals = new Map<string, { name: string; quantity: number; revenue: Prisma.Decimal }>();

  for (const item of items) {
    const current = totals.get(item.menuItem.name) ?? {
      name: item.menuItem.name,
      quantity: 0,
      revenue: new Prisma.Decimal(0),
    };
    const addonsPerItem = item.addons.reduce((sum, addon) => sum.plus(addon.price), new Prisma.Decimal(0));
    current.quantity += item.quantity;
    current.revenue = current.revenue.plus(item.unitPrice.plus(addonsPerItem).mul(item.quantity));
    totals.set(item.menuItem.name, current);
  }

  return Array.from(totals.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue.comparedTo(a.revenue))
    .slice(0, limit)
    .map((item) => ({
      name: item.name,
      quantity: item.quantity,
      revenue: money(item.revenue),
    }));
}

export async function getPeakHours(range: ReportRange) {
  const { start, end } = getDateBounds(range.from, range.to);

  const orders = await prisma.order.findMany({
    where: { ...COMPLETED_ORDER_FILTER, createdAt: { gte: start, lte: end } },
    select: { createdAt: true },
  });

  const buckets = Array.from({ length: 24 }, (_, hour) => ({ label: `${hour.toString().padStart(2, '0')}:00`, orders: 0 }));

  for (const order of orders) {
    const hour = order.createdAt.getUTCHours();
    buckets[hour].orders += 1;
  }

  return buckets;
}

export async function getPaymentModeSplit(range: ReportRange) {
  const { start, end } = getDateBounds(range.from, range.to);

  const rows = await prisma.payment.groupBy({
    by: ['method'],
    where: {
      status: 'PAID',
      createdAt: { gte: start, lte: end },
      order: {
        ...COMPLETED_ORDER_FILTER,
        createdAt: { gte: start, lte: end },
      },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({
      mode: row.method,
      total: money(asDecimal(row._sum.amount)),
      count: row._count?._all ?? 0,
    }))
    .sort((a, b) => new Prisma.Decimal(b.total).comparedTo(a.total));
}

export async function getGstSummary(range: ReportRange) {
  const { start, end } = getDateBounds(range.from, range.to);

  const rows = await prisma.order.findMany({
    where: { ...COMPLETED_ORDER_FILTER, createdAt: { gte: start, lte: end } },
    select: { subtotal: true, discount: true, total: true, taxAmount: true },
  });

  const netSales = rows.reduce(
    (sum, order) => sum.plus(order.subtotal).minus(order.discount),
    new Prisma.Decimal(0),
  );
  const totalTax = rows.reduce((sum, order) => sum.plus(order.taxAmount), new Prisma.Decimal(0));
  const grossSales = rows.reduce((sum, order) => sum.plus(order.total), new Prisma.Decimal(0));
  const taxRate = grossSales.gt(0) ? totalTax.div(grossSales).mul(100) : new Prisma.Decimal(0);

  return {
    netSales: money(netSales),
    totalTax: money(totalTax),
    grossSales: money(grossSales),
    taxRate: Number(taxRate.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)),
    orderCount: rows.length,
  };
}

const csvCell = (value: string | number) => {
  const text = String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

export async function getCsvExport(range: ReportRange) {
  const { start, end } = getDateBounds(range.from, range.to);
  const orders = await prisma.order.findMany({
    where: { ...COMPLETED_ORDER_FILTER, createdAt: { gte: start, lte: end } },
    select: {
      orderNumber: true,
      createdAt: true,
      type: true,
      subtotal: true,
      taxAmount: true,
      discount: true,
      total: true,
      table: { select: { number: true } },
      payments: { where: { status: 'PAID' }, select: { method: true, amount: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const rows = [
    ['Date', 'Order', 'Type', 'Table', 'Subtotal', 'GST', 'Discount', 'Total', 'Payments'].map(csvCell).join(','),
    ...orders.map((order) => [
      order.createdAt.toISOString(),
      order.orderNumber,
      order.type,
      order.table ? String(order.table.number) : 'Walk-in',
      order.subtotal.toFixed(2),
      order.taxAmount.toFixed(2),
      order.discount.toFixed(2),
      order.total.toFixed(2),
      order.payments.map((payment) => `${payment.method} ${payment.amount.toFixed(2)}`).join('; '),
    ].map(csvCell).join(',')),
  ];
  return `${rows.join('\r\n')}\r\n`;
}
