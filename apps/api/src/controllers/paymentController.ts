import { Request, Response } from 'express';

import { createPaymentOrderSchema, verifyPaymentSchema } from '@restaurant/shared';

import * as paymentService from '../services/paymentService.js';

export async function createPaymentOrder(req: Request, res: Response) {
  const parsed = createPaymentOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid payment payload' },
    });
    return;
  }
  try {
    const result = await paymentService.createPaymentOrder(parsed.data.orderId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create payment';
    const status = message === 'ORDER_NOT_FOUND' ? 404 : message === 'PAYMENT_GATEWAY_UNAVAILABLE' ? 503 : 409;
    const code = status === 404 ? 'ORDER_NOT_FOUND' : status === 503 ? 'PAYMENT_GATEWAY_UNAVAILABLE' : 'PAYMENT_CREATE_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function verifyPayment(req: Request, res: Response) {
  const parsed = verifyPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid payment verification payload' },
    });
    return;
  }
  try {
    const result = await paymentService.capturePayment(parsed.data);
    res.json({ success: true, data: { ...result, verified: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to verify payment';
    const status = message === 'INVALID_SIGNATURE' ? 400 : message === 'PAYMENT_NOT_FOUND' ? 404 : 409;
    const code = status === 400 ? 'INVALID_SIGNATURE' : status === 404 ? 'PAYMENT_NOT_FOUND' : 'PAYMENT_STATE_CONFLICT';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function handleWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = typeof req.headers['x-razorpay-signature'] === 'string' ? req.headers['x-razorpay-signature'] : undefined;
  if (!rawBody.length || !paymentService.verifyWebhookSignature({ signature, payload: rawBody })) {
    res.status(400).json({ success: false, error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature is invalid.' } });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ success: false, error: { code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Webhook payload is invalid JSON.' } });
    return;
  }

  try {
    const result = await paymentService.processWebhookCapture(payload);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to process payment webhook';
    const status = message === 'PAYMENT_NOT_FOUND' ? 404 : message === 'INVALID_WEBHOOK_PAYLOAD' ? 400 : 409;
    const code = status === 404 ? 'PAYMENT_NOT_FOUND' : status === 400 ? 'INVALID_WEBHOOK_PAYLOAD' : 'PAYMENT_STATE_CONFLICT';
    res.status(status).json({ success: false, error: { code, message } });
  }
}
