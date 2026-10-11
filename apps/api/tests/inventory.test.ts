import { Prisma } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { deductIngredientsForOrder, restoreIngredientsForOrder } from '../src/services/inventoryService.js';

jest.mock('../src/lib/prisma.js', () => ({
  prisma: {
    recipe: { findMany: jest.fn() },
    ingredient: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  },
}));

const recipeRow = {
  ingredientId: 'ingredient-1',
  qtyUsed: new Prisma.Decimal('2.50'),
  ingredient: { id: 'ingredient-1', name: 'Flour' },
};

describe('transactional inventory deduction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses an atomic stock floor and rejects an order when inventory is insufficient', async () => {
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([recipeRow]);
    (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
      id: 'ingredient-1',
      name: 'Flour',
      stockQty: new Prisma.Decimal('2.50'),
    });
    (prisma.ingredient.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(deductIngredientsForOrder([{ menuItemId: 'menu-1', quantity: 2 }]))
      .rejects.toThrow('Not enough Flour.');
    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ingredient-1', stockQty: { gte: new Prisma.Decimal('5.00') } },
      data: { stockQty: { decrement: new Prisma.Decimal('5.00') } },
    });
  });

  it('decrements stock when the atomic floor check passes', async () => {
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([recipeRow]);
    (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
      id: 'ingredient-1',
      name: 'Flour',
      stockQty: new Prisma.Decimal('10.00'),
    });
    (prisma.ingredient.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(deductIngredientsForOrder([{ menuItemId: 'menu-1', quantity: 2 }]))
      .resolves.toEqual({ updated: true });
  });

  it('rejects one of two concurrent orders so stock never oversells', async () => {
    // Two orders each need 5.00; only one atomic decrement can pass the gte:5 floor.
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([recipeRow]);
    (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
      id: 'ingredient-1',
      name: 'Flour',
      stockQty: new Prisma.Decimal('5.00'),
    });
    // First decrement succeeds, second finds stock already below the floor.
    (prisma.ingredient.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const first = deductIngredientsForOrder([{ menuItemId: 'menu-1', quantity: 2 }]);
    const second = deductIngredientsForOrder([{ menuItemId: 'menu-1', quantity: 2 }]);

    await expect(first).resolves.toEqual({ updated: true });
    await expect(second).rejects.toThrow('Not enough Flour.');
    expect(prisma.ingredient.updateMany).toHaveBeenCalledTimes(2);
  });

  it('deducts across multiple order items in one pass', async () => {
    // Two distinct menu items, each with one ingredient row.
    (prisma.recipe.findMany as jest.Mock)
      .mockResolvedValueOnce([recipeRow])
      .mockResolvedValueOnce([{
        ingredientId: 'ingredient-2',
        qtyUsed: new Prisma.Decimal('1.00'),
        ingredient: { id: 'ingredient-2', name: 'Sugar' },
      }]);
    (prisma.ingredient.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'ingredient-1', name: 'Flour', stockQty: new Prisma.Decimal('5.00') })
      .mockResolvedValueOnce({ id: 'ingredient-2', name: 'Sugar', stockQty: new Prisma.Decimal('3.00') });
    (prisma.ingredient.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(deductIngredientsForOrder([
      { menuItemId: 'menu-1', quantity: 2 },
      { menuItemId: 'menu-2', quantity: 1 },
    ])).resolves.toEqual({ updated: true });
    expect(prisma.ingredient.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('stock restore on cancel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('increments previously deducted stock back in the same transaction', async () => {
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([recipeRow]);
    (prisma.ingredient.update as jest.Mock).mockResolvedValue({});

    await expect(restoreIngredientsForOrder([{ menuItemId: 'menu-1', quantity: 2 }], prisma as never))
      .resolves.toEqual({ restored: true });
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ingredient-1' },
      data: { stockQty: { increment: new Prisma.Decimal('5.00') } },
    });
  });

  it('round-trips: deduct then restore returns the original stock figure', async () => {
    // Deduct 2 × 2.50 = 5.00 from 10.00 -> 5.00; restore the same amount -> 10.00.
    (prisma.recipe.findMany as jest.Mock).mockResolvedValue([recipeRow]);
    (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
      id: 'ingredient-1', name: 'Flour', stockQty: new Prisma.Decimal('10.00'),
    });
    (prisma.ingredient.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.ingredient.update as jest.Mock).mockResolvedValue({});

    await deductIngredientsForOrder([{ menuItemId: 'menu-1', quantity: 2 }]);
    const deductCall = (prisma.ingredient.updateMany as jest.Mock).mock.calls[0][0];
    await restoreIngredientsForOrder([{ menuItemId: 'menu-1', quantity: 2 }], prisma as never);
    const restoreCall = (prisma.ingredient.update as jest.Mock).mock.calls[0][0];

    expect(deductCall.data.stockQty.decrement).toEqual(restoreCall.data.stockQty.increment);
  });
});
