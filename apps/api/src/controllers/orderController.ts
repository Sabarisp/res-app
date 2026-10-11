import { Request, Response } from 'express';

import { streamInvoicePdf } from '../services/invoiceService.js';

import { addOrderItemsSchema, billPreviewSchema, cancelOrderItemSchema, cancelOrderSchema, closeOrderSchema, placeOrderSchema, staffOrderSchema, updateOrderItemStatusSchema, updateOrderStatusSchema } from '@restaurant/shared';

import * as orderService from '../services/orderService.js';

export async function createOrder(req: Request, res: Response) {
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid order payload' },
    });
    return;
  }
  try {
    const order = await orderService.createOrder(parsed.data);
    res.status(201).json({ success: true, data: order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to place order';
    const status = message === 'TABLE_NOT_FOUND' ? 404 : message === 'MENU_ITEM_UNAVAILABLE' || message === 'INVALID_ADDON' ? 400 : 409;
    const code = status === 404 ? 'TABLE_NOT_FOUND' : status === 400 ? 'INVALID_ORDER_ITEM' : 'ORDER_CREATE_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function createStaffOrder(req: Request, res: Response) {
  const parsed = staffOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid order payload' },
    });
    return;
  }
  try {
    const order = await orderService.createStaffOrder(parsed.data);
    res.status(201).json({ success: true, data: order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create order';
    const status = message === 'TABLE_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, error: { code: status === 404 ? 'TABLE_NOT_FOUND' : 'ORDER_CREATE_ERROR', message } });
  }
}

export async function getOrder(req: Request, res: Response) {
  try {
    const order = await orderService.getOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load order';
    res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message } });
  }
}

export async function listOrdersByTable(req: Request, res: Response) {
  try {
    const orders = await orderService.getOrdersByTable(req.params.qrToken);
    res.json({ success: true, data: orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load table orders';
    const status = message === 'TABLE_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ success: false, error: { code: status === 404 ? 'TABLE_NOT_FOUND' : 'ORDER_LIST_ERROR', message } });
  }
}

export async function listKitchenOrders(_req: Request, res: Response) {
  try {
    const orders = await orderService.findOrdersForKitchen();
    res.json({ success: true, data: orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load kitchen orders';
    res.status(500).json({ success: false, error: { code: 'ORDER_LIST_ERROR', message } });
  }
}

export async function listOpenOrders(_req: Request, res: Response) {
  try {
    const orders = await orderService.findOpenOrders();
    res.json({ success: true, data: orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load open orders';
    res.status(500).json({ success: false, error: { code: 'ORDER_LIST_ERROR', message } });
  }
}

export async function addOrderItems(req: Request, res: Response) {
  const parsed = addOrderItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid order items' } });
    return;
  }
  try {
    const result = await orderService.addItemsToOrder(req.params.id, parsed.data);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to add order items';
    const status = message === 'ORDER_NOT_FOUND' ? 404 : message === 'ORDER_NOT_OPEN' ? 409 : 400;
    res.status(status).json({ success: false, error: { code: status === 404 ? 'ORDER_NOT_FOUND' : 'ORDER_UPDATE_ERROR', message } });
  }
}

export async function updateOrderStatus(req: Request, res: Response) {
  const parsed = updateOrderStatusSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.success ? 'Authentication required' : parsed.error.errors[0]?.message || 'Invalid order status' },
    });
    return;
  }

  try {
    const result = await orderService.updateOrderStatus(req.params.id, parsed.data.status, req.user.role);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update order status';
    const status = message === 'ORDER_NOT_FOUND' ? 404
      : message === 'ORDER_STATUS_FORBIDDEN' ? 403
        : message === 'ORDER_TRANSITION_NOT_ALLOWED' || message === 'ORDER_TRANSITION_CONFLICT' || message === 'CANCEL_VIA_ENDPOINT_ONLY' ? 409
          : 500;
    const code = status === 404 ? 'ORDER_NOT_FOUND'
      : status === 403 ? 'FORBIDDEN'
        : status === 409 ? 'ORDER_TRANSITION_NOT_ALLOWED'
          : 'ORDER_STATUS_UPDATE_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function updateOrderItemStatus(req: Request, res: Response) {
  const parsed = updateOrderItemStatusSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.success ? 'Authentication required' : parsed.error.errors[0]?.message || 'Invalid item status' },
    });
    return;
  }

  try {
    const result = await orderService.updateOrderItemStatus(req.params.id, req.params.itemId, parsed.data.status, req.user.role);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update item status';
    const status = message === 'ORDER_ITEM_NOT_FOUND' ? 404
      : message === 'ORDER_STATUS_FORBIDDEN' ? 403
        : message === 'ORDER_TRANSITION_NOT_ALLOWED' || message === 'ORDER_TRANSITION_CONFLICT' ? 409
          : 500;
    const code = status === 404 ? 'ORDER_ITEM_NOT_FOUND'
      : status === 403 ? 'FORBIDDEN'
        : status === 409 ? 'ORDER_TRANSITION_NOT_ALLOWED'
          : 'ITEM_STATUS_UPDATE_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function cancelOrder(req: Request, res: Response) {
  const parsed = cancelOrderSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.success ? 'Authentication required' : parsed.error.errors[0]?.message || 'A cancel reason is required' },
    });
    return;
  }
  try {
    const result = await orderService.cancelOrder(req.params.id, parsed.data.reason, req.user.id, req.user.role);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to cancel order';
    const status = message === 'ORDER_NOT_FOUND' ? 404
      : message === 'ORDER_STATUS_FORBIDDEN' ? 403
        : message === 'ORDER_ALREADY_CLOSED' || message === 'ORDER_ALREADY_CANCELLED' ? 409
          : message === 'ORDER_TRANSITION_NOT_ALLOWED' || message === 'ORDER_TRANSITION_CONFLICT' ? 409
            : 500;
    const code = status === 404 ? 'ORDER_NOT_FOUND'
      : status === 403 ? 'FORBIDDEN'
        : message === 'ORDER_ALREADY_CLOSED' ? 'ORDER_ALREADY_CLOSED'
          : message === 'ORDER_ALREADY_CANCELLED' ? 'ORDER_ALREADY_CANCELLED'
            : status === 409 ? 'ORDER_TRANSITION_NOT_ALLOWED'
              : 'ORDER_CANCEL_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function voidOrderItem(req: Request, res: Response) {
  const parsed = cancelOrderItemSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.success ? 'Authentication required' : parsed.error.errors[0]?.message || 'A void reason is required' },
    });
    return;
  }
  try {
    const result = await orderService.voidOrderItem(req.params.id, req.params.itemId, parsed.data.reason, req.user.id, req.user.role);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to void item';
    const status = message === 'ORDER_ITEM_NOT_FOUND' ? 404
      : message === 'ORDER_STATUS_FORBIDDEN' ? 403
        : message === 'ITEM_ALREADY_PREPARING' || message === 'ORDER_NOT_OPEN' ? 409
          : 500;
    const code = status === 404 ? 'ORDER_ITEM_NOT_FOUND'
      : status === 403 ? 'FORBIDDEN'
        : message === 'ITEM_ALREADY_PREPARING' ? 'ITEM_ALREADY_PREPARING'
          : message === 'ORDER_NOT_OPEN' ? 'ORDER_NOT_OPEN'
            : 'ITEM_VOID_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function callWaiter(req: Request, res: Response) {
  try {
    const result = await orderService.callWaiter(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to call a waiter';
    res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message } });
  }
}

export async function requestBill(req: Request, res: Response) {
  try {
    const result = await orderService.requestBill(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to request a bill';
    res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message } });
  }
}

export async function closeOrder(req: Request, res: Response) {
  const parsed = closeOrderSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.success ? 'Authentication required' : parsed.error.errors[0]?.message || 'Invalid payment payload' },
    });
    return;
  }
  try {
    const result = await orderService.closeOrder(req.params.id, parsed.data, req.user.id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to close order';
    const status = message === 'ORDER_NOT_FOUND' ? 404 : message === 'COUPON_INVALID' || message === 'COUPON_MINIMUM_NOT_MET' || message === 'COUPON_TYPE_UNSUPPORTED' || message === 'PAYMENT_TOTAL_MISMATCH' ? 400 : 409;
    const code = status === 404 ? 'ORDER_NOT_FOUND' : status === 400 ? 'BILL_VALIDATION_ERROR' : 'ORDER_ALREADY_CLOSED';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function previewBill(req: Request, res: Response) {
  const parsed = billPreviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid bill preview' } });
    return;
  }
  try {
    const result = await orderService.previewOrderBill(req.params.id, parsed.data.couponCode);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to preview bill';
    const status = message === 'ORDER_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, error: { code: status === 404 ? 'ORDER_NOT_FOUND' : 'BILL_VALIDATION_ERROR', message } });
  }
}
export async function downloadInvoice(req: Request, res: Response) {
  try {
    await streamInvoicePdf(req.params.id, res);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create invoice';
    const status = message === 'ORDER_NOT_FOUND' ? 404 : message === 'ORDER_NOT_COMPLETED' ? 409 : 500;
    if (!res.headersSent) {
      res.status(status).json({ success: false, error: { code: message, message } });
    }
  }
}
