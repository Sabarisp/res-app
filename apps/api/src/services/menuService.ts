import { AppRole, MenuItemDto } from '@restaurant/shared';

import { prisma } from '../lib/prisma.js';
import { emitToAll } from '../sockets/socketRegistry.js';

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, description: true, sortOrder: true },
  });
}

export async function createCategory(input: { name: string; description?: string | null; sortOrder: number }) {
  return prisma.category.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder,
    },
    select: { id: true, name: true, description: true, sortOrder: true },
  });
}

export async function updateCategory(id: string, input: Partial<{ name: string; description: string | null; sortOrder: number }>) {
  return prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: { id: true, name: true, description: true, sortOrder: true },
  });
}

export async function deleteCategory(id: string) {
  await prisma.category.delete({ where: { id } });
  return { deleted: true };
}

const serializeMenuItem = (item: {
  id: string;
  name: string;
  description: string | null;
  price: { toString(): string };
  categoryId: string;
  category?: { id: string; name: string; description: string | null; sortOrder: number; createdAt: Date; updatedAt: Date } | null;
  isVeg: boolean;
  station: 'KITCHEN' | 'BAR' | 'COUNTER';
  taxPercent: { toString(): string };
  prepTimeMin: number;
  isAvailable: boolean;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  addons?: Array<{ id: string; menuItemId: string; name: string; price: { toString(): string } }>;
}): MenuItemDto => ({
  id: item.id,
  name: item.name,
  description: item.description,
  price: item.price.toString(),
  categoryId: item.categoryId,
  category: item.category ? {
    id: item.category.id,
    name: item.category.name,
    description: item.category.description,
    sortOrder: item.category.sortOrder,
    createdAt: item.category.createdAt.toISOString(),
    updatedAt: item.category.updatedAt.toISOString(),
    _count: undefined,
  } : undefined,
  isVeg: item.isVeg,
  station: item.station,
  taxPercent: item.taxPercent.toString(),
  prepTimeMin: item.prepTimeMin,
  isAvailable: item.isAvailable,
  imageUrl: item.imageUrl,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  addons: item.addons?.map((addon) => ({
    id: addon.id,
    menuItemId: addon.menuItemId,
    name: addon.name,
    price: addon.price.toString(),
  })),
});

export async function listPublicMenu() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      menuItems: {
        where: { isAvailable: true },
        include: { addons: true },
        orderBy: { name: 'asc' },
      },
    },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    menuItems: category.menuItems.map(serializeMenuItem),
  }));
}

export async function listAdminMenu() {
  const items = await prisma.menuItem.findMany({
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    include: {
      category: true,
      addons: true,
    },
  });

  return items.map(serializeMenuItem);
}

export async function createMenuItem(input: {
  name: string;
  description?: string | null;
  price: string;
  categoryId: string;
  isVeg?: boolean;
  station?: 'KITCHEN' | 'BAR' | 'COUNTER';
  taxPercent?: string;
  prepTimeMin?: number;
  isAvailable?: boolean;
  imageUrl?: string | null;
}) {
  const item = await prisma.menuItem.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price: input.price.toString(),
      categoryId: input.categoryId,
      isVeg: input.isVeg ?? true,
      station: input.station ?? 'KITCHEN',
      taxPercent: input.taxPercent?.toString() ?? '5',
      prepTimeMin: Number(input.prepTimeMin ?? 15),
      isAvailable: input.isAvailable ?? true,
      imageUrl: input.imageUrl || null,
    },
    include: { category: true, addons: true },
  });

  return serializeMenuItem(item);
}

export async function updateMenuItem(
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    price: string;
    categoryId: string;
    isVeg: boolean;
    station: 'KITCHEN' | 'BAR' | 'COUNTER';
    taxPercent: string;
    prepTimeMin: number;
    isAvailable: boolean;
    imageUrl: string | null;
  }>,
  actorId: string | null,
) {
  const before = input.price !== undefined
    ? await prisma.menuItem.findUnique({ where: { id }, select: { name: true, price: true } })
    : null;
  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.price !== undefined ? { price: input.price.toString() } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.isVeg !== undefined ? { isVeg: input.isVeg } : {}),
      ...(input.station !== undefined ? { station: input.station } : {}),
      ...(input.taxPercent !== undefined ? { taxPercent: input.taxPercent.toString() } : {}),
      ...(input.prepTimeMin !== undefined ? { prepTimeMin: Number(input.prepTimeMin) } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
    },
    include: { category: true, addons: true },
  });

  if (before && before.price.toString() !== input.price?.toString()) {
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'MENU_PRICE_CHANGED',
        details: `${before.name}: ${before.price.toFixed(2)} -> ${item.price.toFixed(2)}`,
      },
    });
  }

  return serializeMenuItem(item);
}

export async function toggleMenuAvailability(id: string, isAvailable: boolean) {
  const item = await prisma.menuItem.update({
    where: { id },
    data: { isAvailable },
    include: { category: true, addons: true },
  });

  emitToAll('menu:availability_changed', {
    menuItemId: item.id,
    isAvailable: item.isAvailable,
  });
  return serializeMenuItem(item);
}

export async function deleteMenuItem(id: string) {
  await prisma.menuItem.delete({ where: { id } });
  return { deleted: true };
}

export async function createAddon(menuItemId: string, input: { name: string; price: string }) {
  return prisma.addon.create({
    data: {
      menuItemId,
      name: input.name.trim(),
      price: input.price.toString(),
    },
    select: { id: true, menuItemId: true, name: true, price: true },
  }).then((addon) => ({ ...addon, price: addon.price.toString() }));
}

export async function updateAddon(id: string, input: Partial<{ name: string; price: string }>) {
  const addon = await prisma.addon.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.price !== undefined ? { price: input.price.toString() } : {}),
    },
    select: { id: true, menuItemId: true, name: true, price: true },
  });
  return { ...addon, price: addon.price.toString() };
}

export async function deleteAddon(id: string) {
  await prisma.addon.delete({ where: { id } });
  return { deleted: true };
}

export async function auditMenuChange(actorId: string | null, actorRole: AppRole, action: string, details: string) {
  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action,
      details: `${actorRole}: ${details}`,
    },
  });
}
