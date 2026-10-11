import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { emitToAdmin } from '../sockets/socketRegistry.js';

const toStringValue = (value: Prisma.Decimal | number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return new Prisma.Decimal(value).toString();
  }

  return value.toString();
};

const serializeIngredient = (ingredient: {
  id: string;
  name: string;
  unit: string;
  stockQty: Prisma.Decimal;
  reorderLevel: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...ingredient,
  stockQty: ingredient.stockQty.toString(),
  reorderLevel: ingredient.reorderLevel.toString(),
  createdAt: ingredient.createdAt.toISOString(),
  updatedAt: ingredient.updatedAt.toISOString(),
});

const serializeMenuItem = (item: {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  categoryId: string;
  category?: { id: string; name: string; description: string | null; sortOrder: number; createdAt: Date; updatedAt: Date } | null;
  isVeg: boolean;
  station: string;
  taxPercent: Prisma.Decimal;
  prepTimeMin: number;
  isAvailable: boolean;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  addons?: Array<{ id: string; menuItemId: string; name: string; price: Prisma.Decimal }>
  recipes?: Array<{
    ingredientId: string;
    ingredientName: string;
    unit: string;
    qtyUsed: Prisma.Decimal;
    stockQty: Prisma.Decimal;
    reorderLevel: Prisma.Decimal;
  }>;
}) => ({
  ...item,
  price: item.price.toString(),
  taxPercent: item.taxPercent.toString(),
  recipes: item.recipes?.map((entry) => ({
    ingredientId: entry.ingredientId,
    ingredientName: entry.ingredientName,
    unit: entry.unit,
    qtyUsed: entry.qtyUsed.toString(),
    stockQty: entry.stockQty.toString(),
    reorderLevel: entry.reorderLevel.toString(),
  })),
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  addons: item.addons?.map((addon) => ({
    ...addon,
    price: addon.price.toString(),
  })),
  category: item.category ? {
    ...item.category,
    createdAt: item.category.createdAt.toISOString(),
    updatedAt: item.category.updatedAt.toISOString(),
  } : undefined,
});

export async function getMenuItems() {
  const items = await prisma.menuItem.findMany({
    include: {
      category: true,
      recipes: { include: { ingredient: true } },
    },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  });

  return items.map((item) => serializeMenuItem({
    ...item,
    recipes: item.recipes.map((entry) => ({
      ingredientId: entry.ingredient.id,
      ingredientName: entry.ingredient.name,
      unit: entry.ingredient.unit,
      qtyUsed: entry.qtyUsed,
      stockQty: entry.ingredient.stockQty,
      reorderLevel: entry.ingredient.reorderLevel,
    })),
  }));
}

export async function getIngredients() {
  const items = await prisma.ingredient.findMany({
    orderBy: { name: 'asc' },
  });

  return items.map((item) => serializeIngredient(item));
}

export async function createIngredient(input: { name: string; unit: string; stockQty: number; reorderLevel: number }) {
  const name = input.name.trim();
  const existing = await prisma.ingredient.findUnique({ where: { name } });

  if (existing) {
    throw new Error('Ingredient already exists');
  }

  const created = await prisma.ingredient.create({
    data: {
      name,
      unit: input.unit.trim(),
      stockQty: new Prisma.Decimal(input.stockQty),
      reorderLevel: new Prisma.Decimal(input.reorderLevel),
    },
  });

  await notifyLowStock();
  return serializeIngredient(created);
}

export async function updateIngredient(id: string, input: Partial<{ name: string; unit: string; stockQty: number; reorderLevel: number }>) {
  const payload: Prisma.IngredientUpdateInput = {};

  if (typeof input.name === 'string') {
    payload.name = input.name.trim();
  }
  if (typeof input.unit === 'string') {
    payload.unit = input.unit.trim();
  }
  if (typeof input.stockQty === 'number') {
    payload.stockQty = new Prisma.Decimal(input.stockQty);
  }
  if (typeof input.reorderLevel === 'number') {
    payload.reorderLevel = new Prisma.Decimal(input.reorderLevel);
  }

  const ingredient = await prisma.ingredient.update({
    where: { id },
    data: payload,
  });

  await notifyLowStock();
  return serializeIngredient(ingredient);
}

export async function deleteIngredient(id: string) {
  await prisma.ingredient.delete({ where: { id } });
  await notifyLowStock();
}

export async function getRecipe(menuItemId: string) {
  const item = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    include: {
      recipes: {
        include: { ingredient: true },
      },
    },
  });

  if (!item) {
    throw new Error('Menu item not found');
  }

  return item.recipes.map((entry) => ({
    ingredientId: entry.ingredient.id,
    ingredientName: entry.ingredient.name,
    unit: entry.ingredient.unit,
    qtyUsed: entry.qtyUsed.toString(),
    stockQty: entry.ingredient.stockQty.toString(),
    reorderLevel: entry.ingredient.reorderLevel.toString(),
  }));
}

export async function updateRecipe(menuItemId: string, items: { ingredientId: string; qtyUsed: number }[]) {
  const menuItem = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!menuItem) {
    throw new Error('Menu item not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipe.deleteMany({ where: { menuItemId } });

    if (items.length > 0) {
      await tx.recipe.createMany({
        data: items.map((item) => ({
          menuItemId,
          ingredientId: item.ingredientId,
          qtyUsed: new Prisma.Decimal(item.qtyUsed),
        })),
      });
    }
  });

  await notifyLowStock();
  return getRecipe(menuItemId);
}

export async function getLowStockIngredients() {
  const ingredients = await prisma.ingredient.findMany({
    orderBy: { name: 'asc' },
  });

  return ingredients
    .filter((ingredient) => ingredient.stockQty.lte(ingredient.reorderLevel))
    .map((ingredient) => ({
      ...ingredient,
      stockQty: ingredient.stockQty.toString(),
      reorderLevel: ingredient.reorderLevel.toString(),
      createdAt: ingredient.createdAt.toISOString(),
      updatedAt: ingredient.updatedAt.toISOString(),
    }));
}

export async function notifyLowStock() {
  const lowStock = await getLowStockIngredients();

  emitToAdmin('inventory:low_stock', {
    count: lowStock.length,
    items: lowStock,
  });

  return lowStock;
}

export async function deductIngredientsForOrder(
  orderItems: Array<{ menuItemId: string; quantity: number }>,
  tx: Prisma.TransactionClient = prisma,
) {
  const requiredByIngredient = new Map<string, Prisma.Decimal>();

  for (const orderItem of orderItems) {
    const recipe = await tx.recipe.findMany({
      where: { menuItemId: orderItem.menuItemId },
      include: { ingredient: true },
    });

    for (const row of recipe) {
      const amount = new Prisma.Decimal(orderItem.quantity).mul(row.qtyUsed);
      const previous = requiredByIngredient.get(row.ingredientId) ?? new Prisma.Decimal(0);
      requiredByIngredient.set(row.ingredientId, previous.plus(amount));
    }
  }

  for (const [ingredientId, amount] of requiredByIngredient) {
    const ingredient = await tx.ingredient.findUnique({ where: { id: ingredientId } });

    if (!ingredient) {
      throw new Error('Ingredient record missing during stock deduction.');
    }

    // Atomic floor check + decrement in one statement: two concurrent orders can
    // never both pass the floor, so stock never goes below zero (no oversell).
    const result = await tx.ingredient.updateMany({
      where: { id: ingredientId, stockQty: { gte: amount } },
      data: { stockQty: { decrement: amount } },
    });

    if (result.count === 0) {
      throw new Error(`Not enough ${ingredient.name}.`);
    }
  }

  return { updated: true };
}

/**
 * Restores previously deducted stock inside the caller's transaction. Used when an
 * order is cancelled before PREPARING (Phase 5 cancel endpoint), mirroring
 * deductIngredientsForOrder so the two always stay in sync.
 */
export async function restoreIngredientsForOrder(
  orderItems: Array<{ menuItemId: string; quantity: number }>,
  tx: Prisma.TransactionClient = prisma,
) {
  const requiredByIngredient = new Map<string, Prisma.Decimal>();

  for (const orderItem of orderItems) {
    const recipe = await tx.recipe.findMany({
      where: { menuItemId: orderItem.menuItemId },
      include: { ingredient: true },
    });

    for (const row of recipe) {
      const amount = new Prisma.Decimal(orderItem.quantity).mul(row.qtyUsed);
      const previous = requiredByIngredient.get(row.ingredientId) ?? new Prisma.Decimal(0);
      requiredByIngredient.set(row.ingredientId, previous.plus(amount));
    }
  }

  for (const [ingredientId, amount] of requiredByIngredient) {
    await tx.ingredient.update({
      where: { id: ingredientId },
      data: { stockQty: { increment: amount } },
    });
  }

  return { restored: true };
}

/**
 * Applies a signed stock delta to an ingredient (Phase 5-4), flooring the result
 * at zero, and records the movement as an AuditLog entry (details JSON — no new
 * model). Reason is one of PURCHASE, WASTE, CORRECTION.
 */
export async function adjustStock(
  ingredientId: string,
  delta: string,
  reason: 'PURCHASE' | 'WASTE' | 'CORRECTION',
  note: string | null,
  actorId: string,
) {
  const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ingredient) throw new Error('INGREDIENT_NOT_FOUND');

  const deltaDecimal = new Prisma.Decimal(delta);
  const newStock = ingredient.stockQty.plus(deltaDecimal);
  if (newStock.isNegative()) throw new Error('STOCK_BELOW_ZERO');

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.ingredient.update({
      where: { id: ingredientId },
      data: { stockQty: newStock },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'ADJUST_STOCK',
        details: JSON.stringify({ ingredientId, ingredientName: ingredient.name, delta, reason, note }),
      },
    });
    return next;
  });

  await notifyLowStock();
  return serializeIngredient(updated);
}

/**
 * Reads recent stock movements from the audit log (Phase 5-4 history), optionally
 * filtered to a single ingredient.
 */
export async function getStockMovements(ingredientId?: string, limit = 50) {
  const logs = await prisma.auditLog.findMany({
    where: { action: 'ADJUST_STOCK' },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });

  return logs
    .map((log) => {
      try {
        const details = JSON.parse(log.details) as { ingredientId?: string; ingredientName?: string; delta?: string; reason?: string; note?: string | null };
        if (!details.ingredientId || details.delta === undefined) return null;
        return {
          id: log.id,
          ingredientId: details.ingredientId,
          ingredientName: details.ingredientName ?? 'Unknown',
          delta: details.delta,
          reason: (details.reason ?? 'CORRECTION') as 'PURCHASE' | 'WASTE' | 'CORRECTION',
          note: details.note ?? null,
          user: log.user?.name ?? null,
          createdAt: log.createdAt.toISOString(),
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null && (!ingredientId || entry.ingredientId === ingredientId));
}

export { toStringValue };
