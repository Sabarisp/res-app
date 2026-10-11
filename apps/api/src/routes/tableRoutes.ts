import { Router } from 'express';

import * as tableController from '../controllers/tableController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/by-token/:qrToken', tableController.getTableByToken);
router.get('/', requireAuth, requireRole('ADMIN', 'MANAGER', 'WAITER', 'CASHIER'), tableController.listTables);
router.post('/', requireAuth, requireRole('ADMIN', 'MANAGER'), tableController.createTable);
router.patch('/:id', requireAuth, requireRole('ADMIN', 'MANAGER', 'WAITER'), tableController.updateTable);
router.delete('/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), tableController.deleteTable);

export default router;
