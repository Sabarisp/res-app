import crypto from 'node:crypto';
import request from 'supertest';

import { prisma } from '../src/lib/prisma.js';
import app from '../src/app.js';

jest.mock('../src/lib/prisma.js', () => {
  const payment = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const tx = { payment };
  return {
    prisma: {
      payment,
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    },
  };
});

const webhookSecret = 'test-only-razorpay-webhook-secret';
const paymentId = 'pay_test_123';
const orderId = 'order_test_123';
const rawPayload = Buffer.from(JSON.stringify({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: paymentId,
        order_id: orderId,
      },
    },
  },
}));

const signatureFor = (body: Buffer) => crypto
  .createHmac('sha256', webhookSecret)
  .update(body)
  .digest('hex');

describe('payment webhook verification and idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.payment.findUnique as jest.Mock).mockImplementation(({ where }: { where: Record<string, string> }) => {
      if (where.razorpayPaymentId === paymentId) return Promise.resolve(null);
      if (where.razorpayOrderId === orderId) return Promise.resolve({ id: 'payment-row-1', status: 'PENDING' });
      return Promise.resolve(null);
    });
    (prisma.payment.update as jest.Mock).mockResolvedValue({});
  });

  it('rejects forged signatures without touching payment records', async () => {
    const response = await request(app)
      .post('/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', 'forged-signature')
      .send(rawPayload.toString('utf8'));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists a valid capture once and treats delivery retries as idempotent', async () => {
    const signature = signatureFor(rawPayload);
    const first = await request(app)
      .post('/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawPayload.toString('utf8'));
    expect(first.body).toMatchObject({ success: true });

    (prisma.payment.findUnique as jest.Mock).mockImplementation(({ where }: { where: Record<string, string> }) => (
      where.razorpayPaymentId === paymentId
        ? Promise.resolve({ id: 'payment-row-1' })
        : Promise.resolve(null)
    ));
    const second = await request(app)
      .post('/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawPayload.toString('utf8'));

    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('paid');
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('already_processed');
    expect(prisma.payment.update).toHaveBeenCalledTimes(1);
  });
});
