import { Router } from 'express';

import * as inventoryController from '../controllers/inventoryController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/menu-items', requireRole('ADMIN', 'MANAGER', 'CHEF'), inventoryController.listMenuItems);
router.get('/ingredients', requireRole('ADMIN', 'MANAGER', 'CHEF'), inventoryController.listIngredients);
router.post('/ingredients', requireRole('ADMIN', 'MANAGER'), inventoryController.createIngredient);
router.patch('/ingredients/:id', requireRole('ADMIN', 'MANAGER'), inventoryController.updateIngredient);
router.delete('/ingredients/:id', requireRole('ADMIN', 'MANAGER'), inventoryController.deleteIngredient);

router.get('/menu-items/:id/recipe', requireRole('ADMIN', 'MANAGER', 'CHEF'), inventoryController.getRecipe);
router.put('/menu-items/:id/recipe', requireRole('ADMIN', 'MANAGER'), inventoryController.updateRecipe);
router.get('/low-stock', requireRole('ADMIN', 'MANAGER'), inventoryController.listLowStock);
router.get('/stock-movements', requireRole('ADMIN', 'MANAGER'), inventoryController.listStockMovements);
router.post('/ingredients/:id/adjust', requireRole('ADMIN', 'MANAGER'), inventoryController.adjustIngredientStock);

export default router;
