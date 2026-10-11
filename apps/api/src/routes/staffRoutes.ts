import { Router } from 'express';

import * as staffController from '../controllers/staffController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole('ADMIN', 'MANAGER'), staffController.listStaff);
router.get('/audit-log', requireRole('ADMIN', 'MANAGER'), staffController.listAuditLog);
router.post('/', requireRole('ADMIN', 'MANAGER'), staffController.createStaff);
router.patch('/:id', requireRole('ADMIN', 'MANAGER'), staffController.updateStaff);
router.patch('/:id/password', requireRole('ADMIN', 'MANAGER'), staffController.resetPassword);
router.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), staffController.toggleStatus);

export default router;
