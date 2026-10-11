import { Prisma } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { getDailySales, getGstSummary, getSummary, getTopItems } from '../src/services/reportService.js';

jest.mock('../src/lib/prisma.js', () => ({
  prisma: {
    order: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    orderItem: { findMany: jest.fn() },
    payment: { groupBy: jest.fn() },
  },
}));

describe('reports', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns completed revenue and money values as exact decimal strings', async () => {
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { total: new Prisma.Decimal('190.00'), taxAmount: new Prisma.Decimal('10.00') },
      _count: { _all: 2 },
    });
    (prisma.order.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { total: new Prisma.Decimal('95.00'), tableId: 'table-1' },
        { total: new Prisma.Decimal('95.00'), tableId: null },
      ])
      .mockResolvedValueOnce([{ tableId: 'table-1' }]);

    const summary = await getSummary({ from: '2026-10-01', to: '2026-10-31' });

    expect(summary).toMatchObject({
      totalRevenue: '190.00',
      totalTax: '10.00',
      totalOrders: 2,
      averageOrderValue: '95.00',
      tablesServed: 1,
    });
    expect(prisma.order.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'COMPLETED' }),
    }));
  });

  it('sums daily amounts with Decimal rather than floating point', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      { createdAt: new Date('2026-10-02T10:00:00.000Z'), total: new Prisma.Decimal('0.10') },
      { createdAt: new Date('2026-10-02T11:00:00.000Z'), total: new Prisma.Decimal('0.20') },
    ]);

    await expect(getDailySales({ from: '2026-10-01', to: '2026-10-31' }))
      .resolves.toEqual([{ date: '2026-10-02', revenue: '0.30', orders: 2 }]);
  });

  it('calculates GST net and gross sales without counting GST twice', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      {
        subtotal: new Prisma.Decimal('100.00'),
        discount: new Prisma.Decimal('10.00'),
        total: new Prisma.Decimal('95.00'),
        taxAmount: new Prisma.Decimal('5.00'),
      },
    ]);

    await expect(getGstSummary({ from: '2026-10-01', to: '2026-10-31' }))
      .resolves.toMatchObject({
        netSales: '90.00',
        totalTax: '5.00',
        grossSales: '95.00',
        taxRate: 5.26,
        orderCount: 1,
      });
  });

  it('includes addon snapshots in top-item sales totals', async () => {
    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([{
      menuItem: { name: 'Paneer bowl' },
      quantity: 2,
      unitPrice: new Prisma.Decimal('100.00'),
      addons: [{ price: new Prisma.Decimal('10.00') }],
    }]);

    await expect(getTopItems({ from: '2026-10-01', to: '2026-10-31' }))
      .resolves.toEqual([{ name: 'Paneer bowl', quantity: 2, revenue: '220.00' }]);
  });
});
