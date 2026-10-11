import { Router } from 'express';

import * as orderController from '../controllers/orderController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Public customer history for a table (Phase 5-5) — must precede '/:id' routes.
router.get('/by-table/:qrToken', orderController.listOrdersByTable);

router.post('/', orderController.createOrder);
router.post('/staff', requireAuth, requireRole('WAITER', 'MANAGER', 'ADMIN'), orderController.createStaffOrder);
router.get('/open', requireAuth, requireRole('WAITER', 'CASHIER', 'MANAGER', 'ADMIN'), orderController.listOpenOrders);
router.get('/kitchen', requireAuth, requireRole('CHEF', 'MANAGER', 'ADMIN'), orderController.listKitchenOrders);
router.post('/:id/call-waiter', orderController.callWaiter);
router.post('/:id/request-bill', orderController.requestBill);
router.post('/:id/items', requireAuth, requireRole('WAITER', 'MANAGER', 'ADMIN'), orderController.addOrderItems);
router.post('/:id/bill-preview', requireAuth, requireRole('CASHIER', 'MANAGER', 'ADMIN'), orderController.previewBill);
router.post('/:id/close', requireAuth, requireRole('CASHIER', 'MANAGER', 'ADMIN'), orderController.closeOrder);
router.patch('/:id/status', requireAuth, requireRole('WAITER', 'CHEF', 'MANAGER', 'ADMIN'), orderController.updateOrderStatus);
router.patch('/:id/items/:itemId/status', requireAuth, requireRole('WAITER', 'CHEF', 'MANAGER', 'ADMIN'), orderController.updateOrderItemStatus);
router.patch('/:id/cancel', requireAuth, requireRole('WAITER', 'CASHIER', 'MANAGER', 'ADMIN'), orderController.cancelOrder);
router.patch('/:id/items/:itemId/cancel', requireAuth, requireRole('WAITER', 'MANAGER', 'ADMIN'), orderController.voidOrderItem);
router.get('/:id/invoice', requireAuth, requireRole('CASHIER', 'MANAGER', 'ADMIN'), orderController.downloadInvoice);
router.get('/:id', orderController.getOrder);

export default router;
