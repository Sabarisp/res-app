import { Request, Response } from 'express';

import { createAddonSchema, createCategorySchema, createMenuItemSchema, toggleAvailabilitySchema, updateAddonSchema, updateCategorySchema, updateMenuItemSchema } from '@restaurant/shared';

import * as menuService from '../services/menuService.js';

export async function listPublicMenu(_req: Request, res: Response) {
  try {
    const data = await menuService.listPublicMenu();
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load menu';
    res.status(500).json({ success: false, error: { code: 'MENU_ERROR', message } });
  }
}

export async function listAdminMenu(_req: Request, res: Response) {
  try {
    const data = await menuService.listAdminMenu();
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load menu';
    res.status(500).json({ success: false, error: { code: 'MENU_ERROR', message } });
  }
}

export async function listCategories(_req: Request, res: Response) {
  try {
    const data = await menuService.listCategories();
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load categories';
    res.status(500).json({ success: false, error: { code: 'CATEGORY_ERROR', message } });
  }
}

export async function createCategory(req: Request, res: Response) {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid category' } });
    return;
  }
  try {
    const category = await menuService.createCategory(parsed.data);
    res.status(201).json({ success: true, data: category });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create category';
    res.status(400).json({ success: false, error: { code: 'CREATE_ERROR', message } });
  }
}

export async function updateCategory(req: Request, res: Response) {
  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid category update' } });
    return;
  }
  try {
    const category = await menuService.updateCategory(req.params.id, parsed.data);
    res.json({ success: true, data: category });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update category';
    res.status(404).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    const result = await menuService.deleteCategory(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete category';
    res.status(409).json({ success: false, error: { code: 'DELETE_ERROR', message } });
  }
}

export async function createMenuItem(req: Request, res: Response) {
  const parsed = createMenuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid menu item payload' },
    });
    return;
  }

  try {
    const item = await menuService.createMenuItem(parsed.data);
    await menuService.auditMenuChange(req.user?.id ?? null, req.user?.role ?? 'ADMIN', 'CREATE_MENU_ITEM', `Created ${item.name}`);
    res.status(201).json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create menu item';
    res.status(400).json({ success: false, error: { code: 'CREATE_ERROR', message } });
  }
}

export async function updateMenuItem(req: Request, res: Response) {
  const parsed = updateMenuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid menu item payload' },
    });
    return;
  }

  try {
    const item = await menuService.updateMenuItem(req.params.id, parsed.data, req.user?.id ?? null);
    await menuService.auditMenuChange(req.user?.id ?? null, req.user?.role ?? 'ADMIN', 'UPDATE_MENU_ITEM', `Updated ${item.name}`);
    res.json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update menu item';
    res.status(404).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
}

export async function toggleMenuAvailability(req: Request, res: Response) {
  const parsed = toggleAvailabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid availability payload' } });
    return;
  }

  try {
    const item = await menuService.toggleMenuAvailability(req.params.id, parsed.data.isAvailable);
    await menuService.auditMenuChange(req.user?.id ?? null, req.user?.role ?? 'ADMIN', 'TOGGLE_MENU_AVAILABILITY', `${item.name} => ${parsed.data.isAvailable ? 'available' : 'unavailable'}`);
    res.json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update menu availability';
    res.status(404).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
}

export async function deleteMenuItem(req: Request, res: Response) {
  try {
    const result = await menuService.deleteMenuItem(req.params.id);
    await menuService.auditMenuChange(req.user?.id ?? null, req.user?.role ?? 'ADMIN', 'DELETE_MENU_ITEM', `Deleted menu item ${req.params.id}`);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete menu item';
    res.status(404).json({ success: false, error: { code: 'DELETE_ERROR', message } });
  }
}

export async function createAddon(req: Request, res: Response) {
  const parsed = createAddonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid add-on payload' } });
    return;
  }
  try {
    const addon = await menuService.createAddon(req.params.id, parsed.data);
    res.status(201).json({ success: true, data: addon });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create add-on';
    res.status(400).json({ success: false, error: { code: 'CREATE_ERROR', message } });
  }
}

export async function updateAddon(req: Request, res: Response) {
  const parsed = updateAddonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid add-on update' } });
    return;
  }
  try {
    const addon = await menuService.updateAddon(req.params.addonId, parsed.data);
    res.json({ success: true, data: addon });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update add-on';
    res.status(404).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
}

export async function deleteAddon(req: Request, res: Response) {
  try {
    const result = await menuService.deleteAddon(req.params.addonId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete add-on';
    res.status(404).json({ success: false, error: { code: 'DELETE_ERROR', message } });
  }
}
