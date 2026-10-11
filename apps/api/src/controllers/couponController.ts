import { Request, Response } from 'express';

import { createCouponSchema, updateCouponSchema } from '@restaurant/shared';

import * as couponService from '../services/couponService.js';

export async function listCoupons(_req: Request, res: Response) {
  try {
    const coupons = await couponService.listCoupons();
    res.json({ success: true, data: coupons });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load coupons';
    res.status(500).json({ success: false, error: { code: 'COUPON_LIST_ERROR', message } });
  }
}

export async function createCoupon(req: Request, res: Response) {
  const parsed = createCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid coupon payload' },
    });
    return;
  }
  try {
    const coupon = await couponService.createCoupon(parsed.data);
    res.status(201).json({ success: true, data: coupon });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create coupon';
    const status = message === 'COUPON_CODE_EXISTS' || message === 'COUPON_EXPIRY_PAST' ? 409 : 500;
    const code = message === 'COUPON_CODE_EXISTS' ? 'COUPON_CODE_EXISTS'
      : message === 'COUPON_EXPIRY_PAST' ? 'COUPON_EXPIRY_PAST'
        : 'COUPON_CREATE_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function updateCoupon(req: Request, res: Response) {
  const parsed = updateCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid coupon payload' },
    });
    return;
  }
  try {
    const coupon = await couponService.updateCoupon(req.params.id, parsed.data);
    res.json({ success: true, data: coupon });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update coupon';
    const status = message === 'COUPON_NOT_FOUND' ? 404 : message === 'COUPON_CODE_EXISTS' ? 409 : 500;
    const code = message === 'COUPON_NOT_FOUND' ? 'COUPON_NOT_FOUND'
      : message === 'COUPON_CODE_EXISTS' ? 'COUPON_CODE_EXISTS'
        : 'COUPON_UPDATE_ERROR';
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function deleteCoupon(req: Request, res: Response) {
  try {
    const result = await couponService.deleteCoupon(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete coupon';
    const status = message === 'COUPON_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ success: false, error: { code: message === 'COUPON_NOT_FOUND' ? 'COUPON_NOT_FOUND' : 'COUPON_DELETE_ERROR', message } });
  }
}
