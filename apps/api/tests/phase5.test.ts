import { Prisma } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { cancelOrder, voidOrderItem } from '../src/services/orderService.js';
import { adjustStock } from '../src/services/inventoryService.js';
import { createCouponSchema } from '@restaurant/shared';
import { createCoupon, deleteCoupon } from '../src/services/couponService.js';

// A single prisma mock doubles as the transaction client (tx === prisma), so
// cancel/void run their real transaction body against mocked model methods.
jest.mock('../src/lib/prisma.js', () => {
  const db = {
    $transaction: jest.fn(),
    order: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    orderItem: { findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    diningTable: { update: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn() },
    recipe: { findMany: jest.fn() },
    ingredient: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    coupon: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  (db.$transaction as jest.Mock).mockImplementation((callback: (tx: typeof db) => unknown) => callback(db));
  return { prisma: db };
});

jest.mock('../src/sockets/socketRegistry.js', () => ({ emitToRoom: jest.fn(), emitToAdmin: jest.fn() }));

describe('cancel order (Phase 5-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores stock, frees the table and audits when cancelled before PREPARING', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1', status: 'RECEIVED', tableId: 'table-1',
      items: [{ menuItemId: 'menu-1', quantity: 2 }],
    });
    (prisma.order.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([
      { ingredientId: 'ing-1', qtyUsed: new Prisma.Decimal('1.00'), ingredient: { id: 'ing-1', name: 'Flour' } },
    ]);
    (prisma.ingredient.update as jest.Mock).mockResolvedValue({});
    (prisma.order.count as jest.Mock).mockResolvedValue(0);

    await expect(cancelOrder('order-1', 'Guest left', 'waiter-1', 'WAITER'))
      .resolves.toMatchObject({ orderId: 'order-1', status: 'CANCELLED', tableId: 'table-1' });

    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ing-1' },
      data: { stockQty: { increment: new Prisma.Decimal('2.00') } },
    });
    expect(prisma.diningTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'FREE' } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'waiter-1', action: 'CANCEL_ORDER', details: expect.stringContaining('Guest left') },
    });
  });

  it('does not restore stock once the kitchen is PREPARING', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1', status: 'PREPARING', tableId: 'table-1', items: [{ menuItemId: 'menu-1', quantity: 2 }],
    });
    (prisma.order.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.order.count as jest.Mock).mockResolvedValue(1);

    await cancelOrder('order-1', 'Fire risk', 'manager-1', 'MANAGER');
    expect(prisma.recipe.findMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
    // Another open order keeps the table occupied.
    expect(prisma.diningTable.update).not.toHaveBeenCalled();
  });

  it('rejects a chef (wrong role) and a served order (too late)', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({ id: 'order-1', status: 'RECEIVED', tableId: null, items: [] });
    await expect(cancelOrder('order-1', 'reason', 'chef-1', 'CHEF')).rejects.toThrow('ORDER_STATUS_FORBIDDEN');

    (prisma.order.findUnique as jest.Mock).mockResolvedValue({ id: 'order-1', status: 'SERVED', tableId: null, items: [] });
    await expect(cancelOrder('order-1', 'reason', 'waiter-1', 'WAITER')).rejects.toThrow('ORDER_TRANSITION_NOT_ALLOWED');
  });

  it('rejects double cancellation', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({ id: 'order-1', status: 'CANCELLED', tableId: null, items: [] });
    await expect(cancelOrder('order-1', 'reason', 'cashier-1', 'CASHIER')).rejects.toThrow('ORDER_ALREADY_CANCELLED');
  });
});

describe('void one item (Phase 5-2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes the line, restores its stock and recomputes totals', async () => {
    (prisma.orderItem.findUnique as jest.Mock).mockResolvedValue({
      id: 'item-1', orderId: 'order-1', status: 'PENDING', menuItemId: 'menu-1', quantity: 2,
      order: { id: 'order-1', status: 'RECEIVED', tableId: 'table-1' },
    });
    (prisma.orderItem.delete as jest.Mock).mockResolvedValue({});
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([
      { ingredientId: 'ing-1', qtyUsed: new Prisma.Decimal('1.00'), ingredient: { id: 'ing-1', name: 'Flour' } },
    ]);
    (prisma.ingredient.update as jest.Mock).mockResolvedValue({});
    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([
      { unitPrice: new Prisma.Decimal('100.00'), quantity: 1, taxPercent: new Prisma.Decimal('5'), addons: [] },
    ]);
    (prisma.order.update as jest.Mock).mockResolvedValue({});

    await expect(voidOrderItem('order-1', 'item-1', 'Wrong dish', 'waiter-1', 'WAITER'))
      .resolves.toMatchObject({ orderId: 'order-1', itemId: 'item-1', status: 'RECEIVED' });

    expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    expect(prisma.ingredient.update).toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { subtotal: '100.00', taxAmount: '5.00', total: '105.00' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'waiter-1', action: 'VOID_ORDER_ITEM', details: expect.stringContaining('Wrong dish') },
    });
  });

  it('cancels the whole order when the last item is voided', async () => {
    (prisma.orderItem.findUnique as jest.Mock).mockResolvedValue({
      id: 'item-1', orderId: 'order-1', status: 'PENDING', menuItemId: 'menu-1', quantity: 1,
      order: { id: 'order-1', status: 'RECEIVED', tableId: 'table-1' },
    });
    (prisma.orderItem.delete as jest.Mock).mockResolvedValue({});
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.order.update as jest.Mock).mockResolvedValue({});
    (prisma.order.count as jest.Mock).mockResolvedValue(0);

    await expect(voidOrderItem('order-1', 'item-1', 'Only item', 'manager-1', 'MANAGER'))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'CANCELLED' } });
    expect(prisma.diningTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'FREE' } });
  });

  it('refuses to void an item already in the kitchen', async () => {
    (prisma.orderItem.findUnique as jest.Mock).mockResolvedValue({
      id: 'item-1', orderId: 'order-1', status: 'PREPARING', menuItemId: 'menu-1', quantity: 1,
      order: { id: 'order-1', status: 'PREPARING', tableId: 'table-1' },
    });
    await expect(voidOrderItem('order-1', 'item-1', 'reason', 'waiter-1', 'WAITER'))
      .rejects.toThrow('ITEM_ALREADY_PREPARING');
  });
});

describe('coupon management (Phase 5-3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a percent coupon above 100 at the schema', () => {
    const parsed = createCouponSchema.safeParse({ code: 'BIG', type: 'PERCENT', value: 150 });
    expect(parsed.success).toBe(false);
  });

  it('rejects a duplicate coupon code', async () => {
    (prisma.coupon.findUnique as jest.Mock).mockResolvedValue({ id: 'coupon-1' });
    await expect(createCoupon({ code: 'SAVE10', type: 'FIXED', value: 10 } as never))
      .rejects.toThrow('COUPON_CODE_EXISTS');
  });

  it('disables (does not delete) a coupon that has been used', async () => {
    (prisma.coupon.findUnique as jest.Mock).mockResolvedValue({ id: 'coupon-1', _count: { orders: 3 } });
    (prisma.coupon.update as jest.Mock).mockResolvedValue({
      id: 'coupon-1', code: 'USED', type: 'FIXED', value: new Prisma.Decimal('10.00'),
      minOrderValue: null, isActive: false, validFrom: null, validTo: null,
      createdAt: new Date(), updatedAt: new Date(), _count: { orders: 3 },
    });
    const result = await deleteCoupon('coupon-1');
    expect(result.deleted).toBe(false);
    expect(prisma.coupon.delete).not.toHaveBeenCalled();
    expect(prisma.coupon.update).toHaveBeenCalledWith({ where: { id: 'coupon-1' }, data: { isActive: false }, include: expect.anything() });
  });

  it('deletes an unused coupon', async () => {
    (prisma.coupon.findUnique as jest.Mock).mockResolvedValue({ id: 'coupon-2', _count: { orders: 0 } });
    (prisma.coupon.delete as jest.Mock).mockResolvedValue({});
    const result = await deleteCoupon('coupon-2');
    expect(result.deleted).toBe(true);
    expect(prisma.coupon.delete).toHaveBeenCalledWith({ where: { id: 'coupon-2' } });
  });
});

describe('stock adjustment (Phase 5-4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('applies a positive delta, writes an audit movement and re-checks low stock', async () => {
    (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
      id: 'ing-1', name: 'Flour', unit: 'kg',
      stockQty: new Prisma.Decimal('10.00'), reorderLevel: new Prisma.Decimal('2.00'),
      createdAt: new Date(), updatedAt: new Date(),
    });
    (prisma.ingredient.update as jest.Mock).mockResolvedValue({
      id: 'ing-1', name: 'Flour', unit: 'kg',
      stockQty: new Prisma.Decimal('15.00'), reorderLevel: new Prisma.Decimal('2.00'),
      createdAt: new Date(), updatedAt: new Date(),
    });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.ingredient.findMany as jest.Mock).mockResolvedValue([]);

    await expect(adjustStock('ing-1', '5', 'PURCHASE', 'Weekly delivery', 'manager-1'))
      .resolves.toMatchObject({ id: 'ing-1', stockQty: '15' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'manager-1', action: 'ADJUST_STOCK', details: expect.stringContaining('PURCHASE') },
    });
  });

  it('rejects an adjustment that would drive stock below zero', async () => {
    (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
      id: 'ing-1', name: 'Flour', stockQty: new Prisma.Decimal('1.00'),
    });
    await expect(adjustStock('ing-1', '-2', 'WASTE', null, 'manager-1')).rejects.toThrow('STOCK_BELOW_ZERO');
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });
});
