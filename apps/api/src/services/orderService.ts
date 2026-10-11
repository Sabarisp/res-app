import { Prisma } from '@prisma/client';
import type { AddOrderItemsInput, CloseOrderInput, ItemStatus, OrderType, PlaceOrderInput, StaffOrderInput } from '@restaurant/shared';
import { itemTransitionError, orderTransitionError } from '@restaurant/shared';

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { emitToRoom } from '../sockets/socketRegistry.js';
import { calculateOrderTotals } from './orderPricing.js';
import { deductIngredientsForOrder, notifyLowStock, restoreIngredientsForOrder } from './inventoryService.js';
import type { AppRole, OrderStatus } from '@restaurant/shared';

const toMoney = (value: Prisma.Decimal) => new Prisma.Decimal(value.toString());

const serializeOrder = (order: {
  id: string;
  orderNumber: number;
  type: string;
  status: string;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  table: { id: string; number: number; qrToken: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    taxPercent: Prisma.Decimal;
    status: string;
    station: string;
    notes: string | null;
    menuItem: { name: string };
    addons: Array<{ addonName: string; price: Prisma.Decimal }>;
  }>;
  payments?: Array<{ status: string; amount: Prisma.Decimal; method?: string }>;
}) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  type: order.type,
  status: order.status,
  subtotal: order.subtotal.toFixed(2),
  taxAmount: order.taxAmount.toFixed(2),
  discount: order.discount.toFixed(2),
  total: order.total.toFixed(2),
  notes: order.notes,
  createdAt: order.createdAt.toISOString(),
  table: order.table,
  payments: order.payments?.map((payment) => ({
    status: payment.status,
    method: payment.method,
    amount: payment.amount.toFixed(2),
  })) ?? [],
  items: order.items.map((item) => ({
    id: item.id,
    name: item.menuItem.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toFixed(2),
    taxPercent: item.taxPercent.toFixed(2),
    status: item.status,
    station: item.station,
    notes: item.notes,
    addons: item.addons.map((addon) => ({
      name: addon.addonName,
      price: addon.price.toFixed(2),
    })),
  })),
});

async function createOrderRecord(input: PlaceOrderInput | StaffOrderInput, type: OrderType) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: {
      table: { select: { id: true, number: true, qrToken: true } },
      items: { include: { menuItem: { select: { name: true } }, addons: true } },
      payments: { select: { status: true, amount: true, method: true } },
    },
  });
  if (existing) return serializeOrder(existing);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const table = 'qrToken' in input
        ? await tx.diningTable.findUnique({ where: { qrToken: input.qrToken } })
        : input.tableId
          ? await tx.diningTable.findUnique({ where: { id: input.tableId } })
          : null;
      if (('qrToken' in input || ('tableId' in input && input.tableId)) && !table) throw new Error('TABLE_NOT_FOUND');

      const itemIds = [...new Set(input.items.map((item) => item.menuItemId))];
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: itemIds }, isAvailable: true },
        include: { addons: true },
      });
      const menuById = new Map(menuItems.map((item) => [item.id, item]));
      if (menuById.size !== itemIds.length) throw new Error('MENU_ITEM_UNAVAILABLE');

      const lines = input.items.map((line) => {
        const menuItem = menuById.get(line.menuItemId);
        if (!menuItem) throw new Error('MENU_ITEM_UNAVAILABLE');
        const selectedAddons = menuItem.addons.filter((addon) => line.addonIds.includes(addon.id));
        if (selectedAddons.length !== new Set(line.addonIds).size) throw new Error('INVALID_ADDON');
        const addonTotal = selectedAddons.reduce(
          (sum, addon) => sum.plus(toMoney(addon.price)),
          new Prisma.Decimal(0),
        );
        return { line, menuItem, selectedAddons, addonTotal };
      });

      const totals = calculateOrderTotals(lines.map(({ line, menuItem, addonTotal }) => ({
        unitPrice: menuItem.price,
        quantity: line.quantity,
        taxRate: menuItem.taxPercent,
        addonsTotal: addonTotal,
      })));

      const order = await tx.order.create({
        data: {
          tableId: table?.id ?? null,
          type,
          status: 'RECEIVED',
          subtotal: totals.subtotal,
          taxAmount: totals.tax,
          discount: totals.discount,
          total: totals.total,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes?.trim() || null,
          items: {
            create: lines.map(({ line, menuItem, selectedAddons }) => ({
              menuItemId: menuItem.id,
              quantity: line.quantity,
              unitPrice: menuItem.price,
              taxPercent: menuItem.taxPercent,
              station: menuItem.station,
              notes: line.notes?.trim() || null,
              addons: {
                create: selectedAddons.map((addon) => ({
                  addonName: addon.name,
                  price: addon.price,
                })),
              },
            })),
          },
        },
        include: {
          table: { select: { id: true, number: true, qrToken: true } },
          items: { include: { menuItem: { select: { name: true } }, addons: true } },
        },
      });

      await deductIngredientsForOrder(
        lines.map(({ line }) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
        tx,
      );
      if (table) {
        await tx.diningTable.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED' },
        });
      }
      return serializeOrder(order);
    });

    emitToRoom('kitchen', 'order:new', result);
    emitToRoom('waiters', 'order:new', result);
    emitToRoom('admin', 'order:new', result);
    try {
      await notifyLowStock();
    } catch (error: unknown) {
      logger.error({ event: 'LOW_STOCK_NOTIFICATION_FAILED', error });
    }
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: {
          table: { select: { id: true, number: true, qrToken: true } },
          items: { include: { menuItem: { select: { name: true } }, addons: true } },
        },
      });
      if (duplicate) return serializeOrder(duplicate);
    }
    throw error;
  }
}

export async function createOrder(input: PlaceOrderInput) {
  return createOrderRecord(input, 'DINE_IN');
}

export async function createStaffOrder(input: StaffOrderInput) {
  return createOrderRecord(input, input.type);
}

export async function addItemsToOrder(orderId: string, input: AddOrderItemsInput) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') throw new Error('ORDER_NOT_OPEN');

    const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: menuItemIds }, isAvailable: true },
      include: { addons: true },
    });
    const menuById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));
    if (menuById.size !== menuItemIds.length) throw new Error('MENU_ITEM_UNAVAILABLE');

    for (const item of input.items) {
      const menuItem = menuById.get(item.menuItemId);
      if (!menuItem) throw new Error('MENU_ITEM_UNAVAILABLE');
      const addonIds = new Set(item.addonIds);
      const addons = menuItem.addons.filter((addon) => addonIds.has(addon.id));
      if (addons.length !== addonIds.size) throw new Error('INVALID_ADDON');
      await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: menuItem.id,
          quantity: item.quantity,
          unitPrice: menuItem.price,
          taxPercent: menuItem.taxPercent,
          station: menuItem.station,
          notes: item.notes?.trim() || null,
          addons: { create: addons.map((addon) => ({ addonName: addon.name, price: addon.price })) },
        },
      });
    }

    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      include: { addons: true },
    });
    const totals = calculateOrderTotals(orderItems.map((item) => ({
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      taxRate: item.taxPercent,
      addonsTotal: item.addons.reduce((sum, addon) => sum.plus(addon.price), new Prisma.Decimal(0)),
    })));
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'RECEIVED',
        subtotal: totals.subtotal,
        taxAmount: totals.tax,
        discount: '0.00',
        total: totals.total,
      },
    });
    await deductIngredientsForOrder(input.items.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
    })), tx);
    return { orderId, status: 'RECEIVED' as const };
  });

  emitToRoom('kitchen', 'order:new', result);
  emitToRoom('waiters', 'order:new', result);
  try {
    await notifyLowStock();
  } catch (error: unknown) {
    logger.error({ event: 'LOW_STOCK_NOTIFICATION_FAILED', error });
  }
  return result;
}

export async function getOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      table: { select: { id: true, number: true, qrToken: true } },
      items: { include: { menuItem: { select: { name: true } }, addons: true } },
      payments: { select: { status: true, amount: true, method: true } },
    },
  });
  if (!order) throw new Error('ORDER_NOT_FOUND');
  return serializeOrder(order);
}

export async function findOrdersForKitchen() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['RECEIVED', 'PREPARING', 'READY'] } },
    include: {
      table: { select: { id: true, number: true, qrToken: true } },
      items: { include: { menuItem: { select: { name: true } }, addons: true } },
      payments: { select: { status: true, amount: true, method: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return orders.map(serializeOrder);
}

export async function findOpenOrders() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['RECEIVED', 'PREPARING', 'READY', 'SERVED'] } },
    include: {
      table: { select: { id: true, number: true, qrToken: true } },
      items: { include: { menuItem: { select: { name: true } }, addons: true } },
      payments: { select: { status: true, amount: true, method: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return orders.map(serializeOrder);
}

/**
 * Returns the open (not COMPLETED/CANCELLED) orders for a table, keyed by its QR
 * token (Phase 5-5). Public: exposes no customer personal data — only items,
 * status and totals so a returning customer can see every live order.
 */
export async function getOrdersByTable(qrToken: string) {
  const table = await prisma.diningTable.findUnique({
    where: { qrToken },
    select: { id: true, number: true, qrToken: true },
  });
  if (!table) throw new Error('TABLE_NOT_FOUND');

  const orders = await prisma.order.findMany({
    where: { tableId: table.id, status: { in: OPEN_ORDER_STATUSES } },
    include: {
      table: { select: { id: true, number: true, qrToken: true } },
      items: { include: { menuItem: { select: { name: true } }, addons: true } },
      payments: { select: { status: true, amount: true, method: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map(serializeOrder);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, actorRole: AppRole) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('ORDER_NOT_FOUND');

  const fromStatus = order.status as OrderStatus;
  // Cancellation needs a reason + stock restore and lives on the cancel endpoint (Phase 5).
  if (status === 'CANCELLED') throw new Error('CANCEL_VIA_ENDPOINT_ONLY');

  const transitionError = orderTransitionError(fromStatus, status, actorRole);
  if (transitionError === 'ORDER_TRANSITION_NOT_ALLOWED') throw new Error('ORDER_TRANSITION_NOT_ALLOWED');
  if (transitionError === 'ORDER_STATUS_FORBIDDEN') throw new Error('ORDER_STATUS_FORBIDDEN');

  const result = await prisma.order.updateMany({
    where: { id: orderId, status: fromStatus },
    data: { status },
  });
  if (result.count !== 1) throw new Error('ORDER_TRANSITION_CONFLICT');

  if (status === 'SERVED') {
    await prisma.orderItem.updateMany({
      where: { orderId },
      data: { status: 'SERVED' },
    });
  }

  const payload = { orderId, status, tableId: order.tableId };
  emitToRoom(`order:${orderId}`, 'order:status_changed', payload);
  emitToRoom('kitchen', 'order:status_changed', payload);
  emitToRoom('waiters', 'order:status_changed', payload);
  emitToRoom('admin', 'order:status_changed', payload);
  if (order.tableId) emitToRoom(`table:${order.tableId}`, 'order:status_changed', payload);
  return payload;
}

export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  status: ItemStatus,
  actorRole: AppRole,
) {
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true, status: true, order: { select: { id: true, tableId: true, status: true } } },
  });
  if (!item || item.orderId !== orderId || !item.order) throw new Error('ORDER_ITEM_NOT_FOUND');

  const transitionError = itemTransitionError(item.status as ItemStatus, status, actorRole);
  if (transitionError === 'ORDER_TRANSITION_NOT_ALLOWED') throw new Error('ORDER_TRANSITION_NOT_ALLOWED');
  if (transitionError === 'ORDER_STATUS_FORBIDDEN') throw new Error('ORDER_STATUS_FORBIDDEN');

  const result = await prisma.orderItem.updateMany({
    where: { id: itemId, status: item.status },
    data: { status },
  });
  if (result.count !== 1) throw new Error('ORDER_TRANSITION_CONFLICT');

  const payload = { orderId, itemId, status, tableId: item.order.tableId };
  emitToRoom(`order:${orderId}`, 'item:status_changed', payload);
  emitToRoom('kitchen', 'item:status_changed', payload);
  emitToRoom('waiters', 'item:status_changed', payload);
  if (item.order.tableId) emitToRoom(`table:${item.order.tableId}`, 'item:status_changed', payload);
  return payload;
}

// Open statuses that keep a table occupied (mirrors findOpenOrders).
const OPEN_ORDER_STATUSES: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'SERVED'];

/**
 * Cancels an order before it is served (Phase 5-1). In one transaction: sets
 * CANCELLED, restores deducted stock while the kitchen has not started cooking
 * (status < PREPARING), frees the table when no other open order uses it, and
 * writes an audit entry. Emits order:status_changed to every receiver room.
 */
export async function cancelOrder(orderId: string, reason: string, actorId: string, actorRole: AppRole) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, tableId: true, items: { select: { menuItemId: true, quantity: true } } },
    });
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status === 'COMPLETED') throw new Error('ORDER_ALREADY_CLOSED');
    if (order.status === 'CANCELLED') throw new Error('ORDER_ALREADY_CANCELLED');

    const fromStatus = order.status as OrderStatus;
    const transitionError = orderTransitionError(fromStatus, 'CANCELLED', actorRole);
    if (transitionError === 'ORDER_TRANSITION_NOT_ALLOWED') throw new Error('ORDER_TRANSITION_NOT_ALLOWED');
    if (transitionError === 'ORDER_STATUS_FORBIDDEN') throw new Error('ORDER_STATUS_FORBIDDEN');

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: fromStatus },
      data: { status: 'CANCELLED' },
    });
    if (updated.count !== 1) throw new Error('ORDER_TRANSITION_CONFLICT');

    // Stock was deducted at creation; restore it only while the kitchen has not
    // started cooking. A PREPARING-or-later order may already have used ingredients.
    if (fromStatus === 'PENDING' || fromStatus === 'RECEIVED') {
      await restoreIngredientsForOrder(order.items, tx);
    }

    if (order.tableId) {
      const otherOpen = await tx.order.count({
        where: { tableId: order.tableId, id: { not: orderId }, status: { in: OPEN_ORDER_STATUSES } },
      });
      if (otherOpen === 0) {
        await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'FREE' } });
      }
    }

    await tx.auditLog.create({
      data: { userId: actorId, action: 'CANCEL_ORDER', details: JSON.stringify({ orderId, reason, fromStatus }) },
    });

    return { orderId, status: 'CANCELLED' as const, tableId: order.tableId };
  });

  const payload = { orderId: result.orderId, status: result.status, tableId: result.tableId };
  emitToRoom(`order:${orderId}`, 'order:status_changed', payload);
  emitToRoom('kitchen', 'order:status_changed', payload);
  emitToRoom('waiters', 'order:status_changed', payload);
  emitToRoom('admin', 'order:status_changed', payload);
  if (result.tableId) emitToRoom(`table:${result.tableId}`, 'order:status_changed', payload);
  return payload;
}

/**
 * Voids a single order item before it is prepared (Phase 5-2). Removes the line,
 * restores its stock, recomputes order totals server-side, and cancels the whole
 * order when it was the last remaining item.
 */
export async function voidOrderItem(orderId: string, itemId: string, reason: string, actorId: string, _actorRole: AppRole) {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({
      where: { id: itemId },
      select: { id: true, orderId: true, status: true, menuItemId: true, quantity: true, order: { select: { id: true, status: true, tableId: true } } },
    });
    if (!item || item.orderId !== orderId || !item.order) throw new Error('ORDER_ITEM_NOT_FOUND');
    if (item.order.status === 'COMPLETED' || item.order.status === 'CANCELLED') throw new Error('ORDER_NOT_OPEN');
    // Void only before the item enters the kitchen.
    if (item.status !== 'PENDING') throw new Error('ITEM_ALREADY_PREPARING');

    await tx.orderItem.delete({ where: { id: itemId } });
    await restoreIngredientsForOrder([{ menuItemId: item.menuItemId, quantity: item.quantity }], tx);

    const remaining = await tx.orderItem.findMany({ where: { orderId }, include: { addons: true } });
    if (remaining.length === 0) {
      // Last item voided: cancel the order so the table is released.
      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
      if (item.order.tableId) {
        const otherOpen = await tx.order.count({
          where: { tableId: item.order.tableId, id: { not: orderId }, status: { in: OPEN_ORDER_STATUSES } },
        });
        if (otherOpen === 0) {
          await tx.diningTable.update({ where: { id: item.order.tableId }, data: { status: 'FREE' } });
        }
      }
      await tx.auditLog.create({
        data: { userId: actorId, action: 'CANCEL_ORDER', details: JSON.stringify({ orderId, reason, via: 'void_last_item' }) },
      });
      return { orderId, itemId, status: 'CANCELLED' as const, tableId: item.order.tableId };
    }

    const totals = calculateOrderTotals(remaining.map((line) => ({
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      taxRate: line.taxPercent,
      addonsTotal: line.addons.reduce((sum, addon) => sum.plus(addon.price), new Prisma.Decimal(0)),
    })));
    await tx.order.update({
      where: { id: orderId },
      data: { subtotal: totals.subtotal, taxAmount: totals.tax, total: totals.total },
    });
    await tx.auditLog.create({
      data: { userId: actorId, action: 'VOID_ORDER_ITEM', details: JSON.stringify({ orderId, itemId, reason }) },
    });
    return { orderId, itemId, status: 'RECEIVED' as const, tableId: item.order.tableId };
  });

  const payload = { orderId: result.orderId, itemId: result.itemId, status: result.status, tableId: result.tableId };
  emitToRoom(`order:${orderId}`, 'item:status_changed', payload);
  emitToRoom('kitchen', 'item:status_changed', payload);
  emitToRoom('waiters', 'item:status_changed', payload);
  emitToRoom('admin', 'item:status_changed', payload);
  if (result.tableId) emitToRoom(`table:${result.tableId}`, 'item:status_changed', payload);
  // When the whole order was cancelled, also broadcast the order-level change.
  if (result.status === 'CANCELLED') {
    const orderPayload = { orderId, status: 'CANCELLED', tableId: result.tableId };
    emitToRoom(`order:${orderId}`, 'order:status_changed', orderPayload);
    emitToRoom('kitchen', 'order:status_changed', orderPayload);
    emitToRoom('waiters', 'order:status_changed', orderPayload);
    emitToRoom('admin', 'order:status_changed', orderPayload);
    if (result.tableId) emitToRoom(`table:${result.tableId}`, 'order:status_changed', orderPayload);
  }
  return result;
}

export async function callWaiter(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, tableId: true } });
  if (!order) throw new Error('ORDER_NOT_FOUND');
  const payload = { orderId, tableId: order.tableId };
  emitToRoom('waiters', 'waiter:called', payload);
  if (order.tableId) emitToRoom(`table:${order.tableId}`, 'waiter:called', payload);
  return { sent: true };
}

export async function requestBill(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, tableId: true } });
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (order.tableId) {
    await prisma.diningTable.update({ where: { id: order.tableId }, data: { status: 'BILL_REQUESTED' } });
  }
  const payload = { orderId, tableId: order.tableId };
  emitToRoom('waiters', 'bill:requested', payload);
  emitToRoom('admin', 'bill:requested', payload);
  if (order.tableId) emitToRoom(`table:${order.tableId}`, 'bill:requested', payload);
  return { sent: true };
}

async function calculateCouponDiscount(tx: Prisma.TransactionClient, subtotal: Prisma.Decimal, couponCode?: string) {
  if (!couponCode) return { discount: new Prisma.Decimal(0), couponId: null };
  const coupon = await tx.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
  const now = new Date();
  if (!coupon || !coupon.isActive || (coupon.validFrom && coupon.validFrom > now) || (coupon.validTo && coupon.validTo < now)) {
    throw new Error('COUPON_INVALID');
  }
  if (coupon.minOrderValue && subtotal.lt(coupon.minOrderValue)) throw new Error('COUPON_MINIMUM_NOT_MET');
  let discount: Prisma.Decimal;
  if (coupon.type === 'PERCENT') {
    discount = subtotal.mul(coupon.value).div(100);
  } else if (coupon.type === 'FIXED') {
    discount = coupon.value;
  } else {
    throw new Error('COUPON_TYPE_UNSUPPORTED');
  }
  discount = (discount.gt(subtotal) ? subtotal : discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { discount, couponId: coupon.id };
}

export async function previewOrderBill(orderId: string, couponCode?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        subtotal: true,
        taxAmount: true,
        total: true,
        payments: { where: { status: 'PAID' }, select: { amount: true, method: true } },
      },
    });
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') throw new Error('ORDER_NOT_OPEN');
    const { discount } = await calculateCouponDiscount(tx, order.subtotal, couponCode);
    const total = order.subtotal.plus(order.taxAmount).minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const paidAmount = order.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
    if (paidAmount.gt(total)) throw new Error('PAID_AMOUNT_EXCEEDS_TOTAL');
    return {
      subtotal: order.subtotal.toFixed(2),
      taxAmount: order.taxAmount.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      paidAmount: paidAmount.toFixed(2),
      amountDue: total.minus(paidAmount).toFixed(2),
    };
  });
}

export async function closeOrder(orderId: string, input: CloseOrderInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        subtotal: true,
        taxAmount: true,
        tableId: true,
        total: true,
        payments: { where: { status: 'PAID' }, select: { amount: true, method: true } },
      },
    });
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status === 'COMPLETED') throw new Error('ORDER_ALREADY_CLOSED');
    if (order.status === 'CANCELLED') throw new Error('ORDER_CANCELLED');

    const { discount, couponId } = await calculateCouponDiscount(tx, order.subtotal, input.couponCode);

    const total = order.subtotal.plus(order.taxAmount).minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const alreadyPaid = order.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
    if (alreadyPaid.gt(total)) throw new Error('PAID_AMOUNT_EXCEEDS_TOTAL');
    const amountDue = total.minus(alreadyPaid);
    const tenderedAmount = input.payments.reduce(
      (sum, payment) => sum.plus(new Prisma.Decimal(payment.amount)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (!tenderedAmount.eq(amountDue)) throw new Error('PAYMENT_TOTAL_MISMATCH');

    if (input.payments.length > 0) {
      await tx.payment.createMany({
        data: input.payments.map((payment) => ({
          orderId,
          amount: payment.amount,
          method: payment.method,
          status: 'PAID',
        })),
      });
    }

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: 'COMPLETED', discount, total, couponId },
    });
    if (updated.count !== 1) throw new Error('ORDER_ALREADY_CLOSED');
    if (order.tableId) {
      await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'FREE' } });
    }
    await tx.auditLog.create({
      data: { userId: actorId, action: 'CLOSE_ORDER', details: `Order ${orderId} closed for ${total.toFixed(2)}` },
    });
    return {
      orderId,
      status: 'COMPLETED',
      tableId: order.tableId,
      subtotal: order.subtotal.toFixed(2),
      taxAmount: order.taxAmount.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      payments: [
        ...order.payments.map((payment) => ({ method: payment.method, amount: payment.amount.toFixed(2) })),
        ...input.payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
      ],
    };
  }).then((result) => {
    const payload = { orderId, status: result.status };
    emitToRoom(`order:${orderId}`, 'order:status_changed', payload);
    emitToRoom('waiters', 'order:status_changed', payload);
    emitToRoom('kitchen', 'order:status_changed', payload);
    emitToRoom('admin', 'order:status_changed', payload);
    if (result.tableId) emitToRoom(`table:${result.tableId}`, 'order:status_changed', payload);
    return result;
  });
}
