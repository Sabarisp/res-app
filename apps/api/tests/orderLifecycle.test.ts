import { prisma } from '../src/lib/prisma.js';
import { emitToRoom } from '../src/sockets/socketRegistry.js';
import { updateOrderItemStatus, updateOrderStatus } from '../src/services/orderService.js';

jest.mock('../src/lib/prisma.js', () => ({
  prisma: {
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    orderItem: { findUnique: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock('../src/sockets/socketRegistry.js', () => ({ emitToRoom: jest.fn() }));

describe('order status authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1',
      tableId: 'table-1',
      status: 'RECEIVED',
    });
    (prisma.order.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('rejects a wrong-role transition with ORDER_STATUS_FORBIDDEN (403)', async () => {
    await expect(updateOrderStatus('order-1', 'PREPARING', 'WAITER'))
      .rejects.toThrow('ORDER_STATUS_FORBIDDEN');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an impossible transition with ORDER_TRANSITION_NOT_ALLOWED (409)', async () => {
    await expect(updateOrderStatus('order-1', 'SERVED', 'CHEF'))
      .rejects.toThrow('ORDER_TRANSITION_NOT_ALLOWED');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('refuses cancellation through the generic status endpoint', async () => {
    await expect(updateOrderStatus('order-1', 'CANCELLED', 'WAITER'))
      .rejects.toThrow('CANCEL_VIA_ENDPOINT_ONLY');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('allows a chef to start preparing and emits to every receiver room', async () => {
    await expect(updateOrderStatus('order-1', 'PREPARING', 'CHEF'))
      .resolves.toMatchObject({ orderId: 'order-1', status: 'PREPARING', tableId: 'table-1' });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'RECEIVED' },
      data: { status: 'PREPARING' },
    });
    const payload = { orderId: 'order-1', status: 'PREPARING', tableId: 'table-1' };
    expect(emitToRoom).toHaveBeenCalledWith('order:order-1', 'order:status_changed', payload);
    expect(emitToRoom).toHaveBeenCalledWith('kitchen', 'order:status_changed', payload);
    expect(emitToRoom).toHaveBeenCalledWith('waiters', 'order:status_changed', payload);
    expect(emitToRoom).toHaveBeenCalledWith('admin', 'order:status_changed', payload);
    expect(emitToRoom).toHaveBeenCalledWith('table:table-1', 'order:status_changed', payload);
  });

  it('lets a waiter mark a ready order served', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1',
      tableId: 'table-1',
      status: 'READY',
    });
    await expect(updateOrderStatus('order-1', 'SERVED', 'WAITER'))
      .resolves.toMatchObject({ status: 'SERVED' });
    expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: { status: 'SERVED' },
    });
  });
});

describe('order item status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.orderItem.findUnique as jest.Mock).mockResolvedValue({
      id: 'item-1',
      orderId: 'order-1',
      status: 'PENDING',
      order: { id: 'order-1', tableId: 'table-1', status: 'RECEIVED' },
    });
    (prisma.orderItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('lets a chef mark an item preparing and emits item:status_changed', async () => {
    await expect(updateOrderItemStatus('order-1', 'item-1', 'PREPARING', 'CHEF'))
      .resolves.toMatchObject({ orderId: 'order-1', itemId: 'item-1', status: 'PREPARING' });
    expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', status: 'PENDING' },
      data: { status: 'PREPARING' },
    });
    expect(emitToRoom).toHaveBeenCalledWith('kitchen', 'item:status_changed', expect.objectContaining({ itemId: 'item-1' }));
    expect(emitToRoom).toHaveBeenCalledWith('table:table-1', 'item:status_changed', expect.objectContaining({ itemId: 'item-1' }));
  });

  it('rejects a waiter marking a pending item ready', async () => {
    await expect(updateOrderItemStatus('order-1', 'item-1', 'READY', 'WAITER'))
      .rejects.toThrow('ORDER_STATUS_FORBIDDEN');
    expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an impossible item transition (PENDING -> SERVED)', async () => {
    await expect(updateOrderItemStatus('order-1', 'item-1', 'SERVED', 'ADMIN'))
      .rejects.toThrow('ORDER_TRANSITION_NOT_ALLOWED');
  });

  it('rejects an item that belongs to another order', async () => {
    await expect(updateOrderItemStatus('order-2', 'item-1', 'PREPARING', 'CHEF'))
      .rejects.toThrow('ORDER_ITEM_NOT_FOUND');
  });
});
