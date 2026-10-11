import { Prisma } from '@prisma/client';
import type { CouponDto, CreateCouponInput, UpdateCouponInput } from '@restaurant/shared';

import { prisma } from '../lib/prisma.js';

type CouponWithCount = Prisma.CouponGetPayload<{ include: { _count: { select: { orders: true } } } }>;

const serializeCoupon = (coupon: CouponWithCount): CouponDto => ({
  id: coupon.id,
  code: coupon.code,
  type: coupon.type === 'PERCENT' ? 'PERCENT' : 'FIXED',
  value: coupon.value.toFixed(2),
  minOrderValue: coupon.minOrderValue ? coupon.minOrderValue.toFixed(2) : null,
  isActive: coupon.isActive,
  validFrom: coupon.validFrom ? coupon.validFrom.toISOString() : null,
  validTo: coupon.validTo ? coupon.validTo.toISOString() : null,
  usedCount: coupon._count.orders,
  createdAt: coupon.createdAt.toISOString(),
  updatedAt: coupon.updatedAt.toISOString(),
});

const include = { _count: { select: { orders: true } } } as const;

export async function listCoupons() {
  const coupons = await prisma.coupon.findMany({ include, orderBy: { createdAt: 'desc' } });
  return coupons.map(serializeCoupon);
}

export async function createCoupon(input: CreateCouponInput) {
  const existing = await prisma.coupon.findUnique({ where: { code: input.code } });
  if (existing) throw new Error('COUPON_CODE_EXISTS');

  if (input.validTo && input.validTo.getTime() <= Date.now()) {
    throw new Error('COUPON_EXPIRY_PAST');
  }

  const created = await prisma.coupon.create({
    data: {
      code: input.code,
      type: input.type,
      value: new Prisma.Decimal(input.value),
      minOrderValue: input.minOrderValue === undefined || input.minOrderValue === null
        ? null
        : new Prisma.Decimal(input.minOrderValue),
      isActive: input.isActive ?? true,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    },
    include,
  });
  return serializeCoupon(created);
}

export async function updateCoupon(id: string, input: UpdateCouponInput) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new Error('COUPON_NOT_FOUND');

  if (input.code && input.code !== existing.code) {
    const clash = await prisma.coupon.findUnique({ where: { code: input.code } });
    if (clash) throw new Error('COUPON_CODE_EXISTS');
  }

  const data: Prisma.CouponUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.type !== undefined) data.type = input.type;
  if (input.value !== undefined) data.value = new Prisma.Decimal(input.value);
  if (input.minOrderValue !== undefined) {
    data.minOrderValue = input.minOrderValue === null ? null : new Prisma.Decimal(input.minOrderValue);
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.validFrom !== undefined) data.validFrom = input.validFrom;
  if (input.validTo !== undefined) data.validTo = input.validTo;

  const updated = await prisma.coupon.update({ where: { id }, data, include });
  return serializeCoupon(updated);
}

/**
 * Deletes a coupon only when it has never been applied to an order. If it has
 * been used, it is disabled instead so historical bills keep their reference.
 */
export async function deleteCoupon(id: string) {
  const existing = await prisma.coupon.findUnique({ where: { id }, include });
  if (!existing) throw new Error('COUPON_NOT_FOUND');

  if (existing._count.orders > 0) {
    const disabled = await prisma.coupon.update({ where: { id }, data: { isActive: false }, include });
    return { deleted: false, coupon: serializeCoupon(disabled) };
  }

  await prisma.coupon.delete({ where: { id } });
  return { deleted: true, coupon: null };
}
