import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export type RazorpayVerification = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

const makeRazorpayClient = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('PAYMENT_GATEWAY_UNAVAILABLE');
  }
  return new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
};

export async function createPaymentOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { where: { status: 'PAID' } } },
  });
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') throw new Error('ORDER_NOT_OPEN');

  const paidAmount = order.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  const due = order.total.minus(paidAmount);
  if (due.lte(0)) throw new Error('ORDER_ALREADY_PAID');

  const pending = await prisma.payment.findFirst({
    where: { orderId, status: 'PENDING', method: 'ONLINE', razorpayOrderId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  const amountPaise = due.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  if (pending?.razorpayOrderId) {
    if (pending.amount.eq(due)) {
      return {
        id: pending.razorpayOrderId,
        amount: pending.amount.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber(),
        currency: 'INR',
        keyId: env.RAZORPAY_KEY_ID,
      };
    }
    await prisma.payment.update({ where: { id: pending.id }, data: { status: 'FAILED' } });
  }

  const gatewayOrder = await makeRazorpayClient().orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: `order-${order.orderNumber}`.slice(0, 40),
  });
  await prisma.payment.create({
    data: {
      orderId,
      amount: due,
      method: 'ONLINE',
      status: 'PENDING',
      razorpayOrderId: gatewayOrder.id,
    },
  });
  return {
    id: gatewayOrder.id,
    amount: gatewayOrder.amount,
    currency: gatewayOrder.currency,
    keyId: env.RAZORPAY_KEY_ID,
  };
}

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export function verifyPaymentSignature(payload: RazorpayVerification): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${payload.razorpay_order_id}|${payload.razorpay_payment_id}`)
    .digest('hex');
  return safeEqual(expected, payload.razorpay_signature);
}

export function verifyWebhookSignature({ signature, payload }: { signature?: string; payload: Buffer | string }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(typeof payload === 'string' ? payload : payload)
    .digest('hex');
  return safeEqual(expected, signature);
}

export async function capturePayment(payload: RazorpayVerification) {
  if (!verifyPaymentSignature(payload)) throw new Error('INVALID_SIGNATURE');
  return persistCapture(payload.razorpay_order_id, payload.razorpay_payment_id);
}

async function persistCapture(razorpayOrderId: string, razorpayPaymentId: string) {
  return prisma.$transaction(async (tx) => {
    const existingCapture = await tx.payment.findUnique({ where: { razorpayPaymentId } });
    if (existingCapture) return { status: 'already_processed', paymentId: razorpayPaymentId };
    const payment = await tx.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) throw new Error('PAYMENT_NOT_FOUND');
    if (payment.status === 'PAID') {
      if (payment.razorpayPaymentId === razorpayPaymentId) return { status: 'already_processed', paymentId: razorpayPaymentId };
      throw new Error('PAYMENT_ALREADY_CAPTURED');
    }
    if (payment.status !== 'PENDING') throw new Error('PAYMENT_NOT_PENDING');
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', razorpayPaymentId },
    });
    return { status: 'paid', paymentId: razorpayPaymentId };
  });
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;

export function extractWebhookPayment(payload: unknown) {
  const root = asRecord(payload);
  const nestedPayload = asRecord(root?.payload);
  const paymentWrapper = asRecord(nestedPayload?.payment);
  const entity = asRecord(paymentWrapper?.entity);
  return {
    event: typeof root?.event === 'string' ? root.event : null,
    paymentId: typeof entity?.id === 'string' ? entity.id : null,
    orderId: typeof entity?.order_id === 'string' ? entity.order_id : null,
  };
}

export async function processWebhookCapture(payload: unknown) {
  const { event, paymentId, orderId } = extractWebhookPayment(payload);
  if (event !== 'payment.captured' || !paymentId || !orderId) throw new Error('INVALID_WEBHOOK_PAYLOAD');
  return persistCapture(orderId, paymentId);
}
