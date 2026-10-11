import { Request, Response } from 'express';

import {
  adjustStockSchema,
  createIngredientSchema,
  updateIngredientSchema,
  updateRecipeSchema,
} from '@restaurant/shared';

import * as inventoryService from '../services/inventoryService.js';

export async function listMenuItems(_req: Request, res: Response) {
  try {
    const items = await inventoryService.getMenuItems();
    res.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load menu items';
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message } });
  }
}

export async function listIngredients(_req: Request, res: Response) {
  try {
    const items = await inventoryService.getIngredients();
    res.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load ingredients';
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message } });
  }
}

export async function createIngredient(req: Request, res: Response) {
  const parsed = createIngredientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid ingredient payload' },
    });
    return;
  }

  try {
    const item = await inventoryService.createIngredient(parsed.data);
    res.status(201).json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create ingredient';
    res.status(400).json({ success: false, error: { code: 'CREATE_ERROR', message } });
  }
}

export async function updateIngredient(req: Request, res: Response) {
  const parsed = updateIngredientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid ingredient payload' },
    });
    return;
  }

  try {
    const item = await inventoryService.updateIngredient(req.params.id, parsed.data);
    res.json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update ingredient';
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
  }
}

export async function deleteIngredient(req: Request, res: Response) {
  try {
    await inventoryService.deleteIngredient(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete ingredient';
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
  }
}

export async function getRecipe(req: Request, res: Response) {
  try {
    const recipe = await inventoryService.getRecipe(req.params.id);
    res.json({ success: true, data: recipe });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load recipe';
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
  }
}

export async function updateRecipe(req: Request, res: Response) {
  const parsed = updateRecipeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid recipe payload' },
    });
    return;
  }

  try {
    const recipe = await inventoryService.updateRecipe(req.params.id, parsed.data.items);
    res.json({ success: true, data: recipe });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update recipe';
    res.status(400).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
}

export async function listLowStock(_req: Request, res: Response) {
  try {
    const items = await inventoryService.getLowStockIngredients();
    res.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load low-stock items';
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message } });
  }
}

export async function adjustIngredientStock(req: Request, res: Response) {
  const parsed = adjustStockSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.success ? 'Authentication required' : parsed.error.errors[0]?.message || 'Invalid stock adjustment' },
    });
    return;
  }
  try {
    const item = await inventoryService.adjustStock(
      req.params.id,
      parsed.data.delta,
      parsed.data.reason,
      parsed.data.note ?? null,
      req.user.id,
    );
    res.json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to adjust stock';
    const status = message === 'INGREDIENT_NOT_FOUND' ? 404 : message === 'STOCK_BELOW_ZERO' ? 409 : 500;
    const code = message === 'INGREDIENT_NOT_FOUND' ? 'INGREDIENT_NOT_FOUND'
      : message === 'STOCK_BELOW_ZERO' ? 'STOCK_BELOW_ZERO'
        : 'STOCK_ADJUST_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function listStockMovements(req: Request, res: Response) {
  try {
    const ingredientId = typeof req.query.ingredientId === 'string' ? req.query.ingredientId : undefined;
    const movements = await inventoryService.getStockMovements(ingredientId);
    res.json({ success: true, data: movements });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load stock movements';
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message } });
  }
}
