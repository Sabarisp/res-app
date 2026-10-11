import { Router } from 'express';

import * as menuController from '../controllers/menuController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', menuController.listPublicMenu);
router.get('/categories', menuController.listCategories);
router.post('/categories', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.createCategory);
router.patch('/categories/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.updateCategory);
router.delete('/categories/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.deleteCategory);
router.get('/admin', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.listAdminMenu);
router.post('/', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.createMenuItem);
router.post('/:id/addons', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.createAddon);
router.patch('/addons/:addonId', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.updateAddon);
router.delete('/addons/:addonId', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.deleteAddon);
router.patch('/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.updateMenuItem);
router.patch('/:id/availability', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.toggleMenuAvailability);
router.delete('/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), menuController.deleteMenuItem);

export default router;
