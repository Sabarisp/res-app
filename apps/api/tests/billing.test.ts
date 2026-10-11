import { Prisma } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { closeOrder, previewOrderBill } from '../src/services/orderService.js';

jest.mock('../src/lib/prisma.js', () => {
  const transaction = {
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    coupon: { findUnique: jest.fn() },
    payment: { createMany: jest.fn() },
    diningTable: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    prisma: {
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

jest.mock('../src/sockets/socketRegistry.js', () => ({ emitToRoom: jest.fn() }));

describe('bill close and online payment reconciliation', () => {
  const dbTransaction = {
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    coupon: { findUnique: jest.fn() },
    payment: { createMany: jest.fn() },
    diningTable: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (tx: typeof dbTransaction) => unknown) => callback(dbTransaction));
    dbTransaction.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'SERVED',
      subtotal: new Prisma.Decimal('100.00'),
      taxAmount: new Prisma.Decimal('5.00'),
      tableId: 'table-1',
      total: new Prisma.Decimal('105.00'),
      payments: [{ amount: new Prisma.Decimal('105.00'), method: 'ONLINE' }],
    });
    dbTransaction.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it('exposes zero due when an order is already fully paid online', async () => {
    await expect(previewOrderBill('order-1')).resolves.toMatchObject({
      total: '105.00',
      paidAmount: '105.00',
      amountDue: '0.00',
    });
  });

  it('closes a fully paid bill without creating a duplicate payment', async () => {
    const result = await closeOrder('order-1', { payments: [] }, 'cashier-1');

    expect(result.status).toBe('COMPLETED');
    expect(result.payments).toEqual([{ method: 'ONLINE', amount: '105.00' }]);
    expect(dbTransaction.payment.createMany).not.toHaveBeenCalled();
    expect(dbTransaction.diningTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: 'FREE' },
    });
  });

  it('requires only the unpaid balance and records split tender in the transaction', async () => {
    dbTransaction.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'SERVED',
      subtotal: new Prisma.Decimal('100.00'),
      taxAmount: new Prisma.Decimal('5.00'),
      tableId: 'table-1',
      total: new Prisma.Decimal('105.00'),
      payments: [{ amount: new Prisma.Decimal('50.00'), method: 'ONLINE' }],
    });

    const result = await closeOrder('order-1', {
      payments: [{ method: 'CASH', amount: '55.00' }],
    }, 'cashier-1');

    expect(result.payments).toEqual([
      { method: 'ONLINE', amount: '50.00' },
      { method: 'CASH', amount: '55.00' },
    ]);
    expect(dbTransaction.payment.createMany).toHaveBeenCalledWith({
      data: [{ orderId: 'order-1', amount: '55.00', method: 'CASH', status: 'PAID' }],
    });
  });

  it('does not close when tenders do not match the remaining amount', async () => {
    await expect(closeOrder('order-1', {
      payments: [{ method: 'CASH', amount: '104.99' }],
    }, 'cashier-1')).rejects.toThrow('PAYMENT_TOTAL_MISMATCH');
    expect(dbTransaction.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects closing an already-completed order (duplicate close)', async () => {
    dbTransaction.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'COMPLETED',
      subtotal: new Prisma.Decimal('100.00'),
      taxAmount: new Prisma.Decimal('5.00'),
      tableId: 'table-1',
      total: new Prisma.Decimal('105.00'),
      payments: [{ amount: new Prisma.Decimal('105.00'), method: 'CASH' }],
    });

    await expect(closeOrder('order-1', { payments: [] }, 'cashier-1'))
      .rejects.toThrow('ORDER_ALREADY_CLOSED');
    expect(dbTransaction.order.updateMany).not.toHaveBeenCalled();
    expect(dbTransaction.payment.createMany).not.toHaveBeenCalled();
    expect(dbTransaction.diningTable.update).not.toHaveBeenCalled();
  });

  it('rejects a coupon whose minimum order value is not met', async () => {
    dbTransaction.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'MIN500',
      type: 'PERCENT',
      value: new Prisma.Decimal(10),
      isActive: true,
      validFrom: null,
      validTo: null,
      minOrderValue: new Prisma.Decimal('500.00'),
    });

    await expect(previewOrderBill('order-1', 'MIN500'))
      .rejects.toThrow('COUPON_MINIMUM_NOT_MET');
    expect(dbTransaction.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown or inactive coupon', async () => {
    dbTransaction.coupon.findUnique.mockResolvedValue(null);
    await expect(previewOrderBill('order-1', 'NOPE')).rejects.toThrow('COUPON_INVALID');

    dbTransaction.coupon.findUnique.mockResolvedValue({
      id: 'coupon-2',
      code: 'EXPIRED',
      type: 'FIXED',
      value: new Prisma.Decimal(20),
      isActive: false,
      validFrom: null,
      validTo: null,
      minOrderValue: null,
    });
    await expect(previewOrderBill('order-1', 'EXPIRED')).rejects.toThrow('COUPON_INVALID');
  });

  it('caps a percent coupon at the subtotal so total never goes negative', async () => {
    dbTransaction.coupon.findUnique.mockResolvedValue({
      id: 'coupon-3',
      code: 'HALF',
      type: 'PERCENT',
      value: new Prisma.Decimal(50),
      isActive: true,
      validFrom: null,
      validTo: null,
      minOrderValue: null,
    });
    dbTransaction.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'SERVED',
      subtotal: new Prisma.Decimal('100.00'),
      taxAmount: new Prisma.Decimal('5.00'),
      tableId: 'table-1',
      total: new Prisma.Decimal('105.00'),
      payments: [],
    });

    // subtotal 100, tax 5 -> 50% coupon = 50 discount, total 55.
    await expect(previewOrderBill('order-1', 'HALF')).resolves.toMatchObject({
      subtotal: '100.00',
      discount: '50.00',
      total: '55.00',
      amountDue: '55.00',
    });
  });
});
