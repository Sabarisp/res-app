import { Router } from 'express';

import * as reportController from '../controllers/reportController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('ADMIN', 'MANAGER'));

router.get('/summary', reportController.getSummary);
router.get('/daily-sales', reportController.getDailySales);
router.get('/top-items', reportController.getTopItems);
router.get('/peak-hours', reportController.getPeakHours);
router.get('/payment-modes', reportController.getPaymentModeSplit);
router.get('/gst-summary', reportController.getGstSummary);
router.get('/export.csv', reportController.exportCsv);

export default router;
