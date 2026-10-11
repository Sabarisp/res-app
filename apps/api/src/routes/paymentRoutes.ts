import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as paymentController from '../controllers/paymentController.js';

const router = Router();

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many payment attempts. Please try again shortly.' },
  },
});

router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.handleWebhook);
router.use(express.json({ limit: '1mb' }));
router.post('/create-order', paymentLimiter, paymentController.createPaymentOrder);
router.post('/verify', paymentLimiter, paymentController.verifyPayment);

export default router;
