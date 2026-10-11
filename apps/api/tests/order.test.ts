import { Prisma } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { createOrder } from '../src/services/orderService.js';
import { deductIngredientsForOrder, notifyLowStock } from '../src/services/inventoryService.js';
import { emitToRoom } from '../src/sockets/socketRegistry.js';

jest.mock('../src/lib/prisma.js', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/services/inventoryService.js', () => ({
  deductIngredientsForOrder: jest.fn(),
  notifyLowStock: jest.fn(),
}));

jest.mock('../src/sockets/socketRegistry.js', () => ({
  emitToRoom: jest.fn(),
}));

const transaction = {
  diningTable: { findUnique: jest.fn(), update: jest.fn() },
  menuItem: { findMany: jest.fn() },
  order: { create: jest.fn() },
};

describe('order creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (tx: typeof transaction) => unknown) => callback(transaction));
  });

  it('uses database prices and creates the order, stock deduction, and table update in one transaction', async () => {
    const itemPrice = new Prisma.Decimal('100.00');
    const addonPrice = new Prisma.Decimal('20.00');
    transaction.diningTable.findUnique.mockResolvedValue({ id: 'table-1', number: 3 });
    transaction.menuItem.findMany.mockResolvedValue([{
      id: 'menu-1',
      name: 'Dish',
      price: itemPrice,
      taxPercent: new Prisma.Decimal('5'),
      station: 'KITCHEN',
      isAvailable: true,
      addons: [{ id: 'addon-1', name: 'Extra', price: addonPrice }],
    }]);
    transaction.order.create.mockImplementation(({ data }: { data: { subtotal: string; taxAmount: string; total: string } }) => ({
      id: 'order-1',
      orderNumber: 1,
      type: 'DINE_IN',
      status: 'RECEIVED',
      subtotal: new Prisma.Decimal(data.subtotal),
      taxAmount: new Prisma.Decimal(data.taxAmount),
      discount: new Prisma.Decimal('0'),
      total: new Prisma.Decimal(data.total),
      notes: null,
      createdAt: new Date('2026-10-04T00:00:00.000Z'),
      table: { id: 'table-1', number: 3, qrToken: 'token' },
      items: [],
    }));

    const result = await createOrder({
      qrToken: 'token',
      idempotencyKey: 'a-valid-idempotency-key',
      items: [{ menuItemId: 'menu-1', quantity: 2, addonIds: ['addon-1'] }],
    });

    expect(result).toMatchObject({ id: 'order-1', subtotal: '240.00', taxAmount: '12.00', total: '252.00' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        subtotal: '240.00',
        taxAmount: '12.00',
        total: '252.00',
        items: expect.objectContaining({
          create: [expect.objectContaining({
            menuItemId: 'menu-1',
            unitPrice: itemPrice,
            addons: { create: [{ addonName: 'Extra', price: addonPrice }] },
          })],
        }),
      }),
    }));
    expect(deductIngredientsForOrder).toHaveBeenCalledWith([{ menuItemId: 'menu-1', quantity: 2 }], transaction);
    expect(transaction.diningTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: 'OCCUPIED' },
    });
    expect(emitToRoom).toHaveBeenCalledWith('kitchen', 'order:new', expect.objectContaining({ id: 'order-1' }));
    expect(notifyLowStock).toHaveBeenCalled();
  });

  it('returns an existing order for a repeated idempotency key without starting a transaction', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-existing',
      orderNumber: 7,
      type: 'DINE_IN',
      status: 'RECEIVED',
      subtotal: new Prisma.Decimal('100'),
      taxAmount: new Prisma.Decimal('5'),
      discount: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('105'),
      notes: null,
      createdAt: new Date('2026-10-04T00:00:00.000Z'),
      table: null,
      items: [],
    });

    const result = await createOrder({
      qrToken: 'token',
      idempotencyKey: 'a-valid-idempotency-key',
      items: [{ menuItemId: 'menu-1', quantity: 1, addonIds: [] }],
    });

    expect(result.id).toBe('order-existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unavailable menu items before creating an order', async () => {
    transaction.diningTable.findUnique.mockResolvedValue({ id: 'table-1', number: 3 });
    transaction.menuItem.findMany.mockResolvedValue([]);

    await expect(createOrder({
      qrToken: 'token',
      idempotencyKey: 'another-valid-idempotency-key',
      items: [{ menuItemId: 'unavailable-item', quantity: 1, addonIds: [] }],
    })).rejects.toThrow('MENU_ITEM_UNAVAILABLE');

    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(deductIngredientsForOrder).not.toHaveBeenCalled();
  });
});
