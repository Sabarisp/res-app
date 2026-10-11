import { Request, Response } from 'express';

import {
  createStaffSchema,
  resetPasswordSchema,
  updateStaffSchema,
} from '@restaurant/shared';

import * as staffService from '../services/staffService.js';

export async function listStaff(_req: Request, res: Response) {
  try {
    const staff = await staffService.listStaff();
    res.json({ success: true, data: staff });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load staff';
    res.status(500).json({ success: false, error: { code: 'STAFF_ERROR', message } });
  }
}

export async function listAuditLog(_req: Request, res: Response) {
  try {
    const logs = await staffService.listAuditLog();
    res.json({ success: true, data: logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load audit log';
    res.status(500).json({ success: false, error: { code: 'STAFF_ERROR', message } });
  }
}

export async function createStaff(req: Request, res: Response) {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid staff payload' },
    });
    return;
  }

  try {
    const actor = req.user;
    const staff = await staffService.createStaff(parsed.data, actor?.id ?? null, actor?.role ?? 'ADMIN');
    res.status(201).json({ success: true, data: staff });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create staff member';
    const code = message === 'ADMIN_ONLY' || message === 'ROLE_BLOCKED' ? 'FORBIDDEN' : 'CREATE_ERROR';
    const status = code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function updateStaff(req: Request, res: Response) {
  const parsed = updateStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid staff update payload' },
    });
    return;
  }

  try {
    const actor = req.user;
    const staff = await staffService.updateStaff(req.params.id, parsed.data, actor?.id ?? null, actor?.role ?? 'ADMIN');
    res.json({ success: true, data: staff });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update staff member';
    const code = message === 'ADMIN_ONLY' || message === 'ROLE_BLOCKED' ? 'FORBIDDEN' : 'UPDATE_ERROR';
    const status = code === 'FORBIDDEN' ? 403 : 404;
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid password payload' },
    });
    return;
  }

  try {
    const actor = req.user;
    const result = await staffService.resetPassword(req.params.id, parsed.data.password, actor?.id ?? null, actor?.role ?? 'ADMIN');
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to reset password';
    const code = message === 'ADMIN_ONLY' || message === 'ROLE_BLOCKED' ? 'FORBIDDEN' : 'UPDATE_ERROR';
    const status = code === 'FORBIDDEN' ? 403 : 404;
    res.status(status).json({ success: false, error: { code, message } });
  }
}

export async function toggleStatus(req: Request, res: Response) {
  const parsed = updateStaffSchema.pick({ isActive: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid status payload' },
    });
    return;
  }

  try {
    const actor = req.user;
    const staff = await staffService.toggleStatus(req.params.id, parsed.data.isActive ?? true, actor?.id ?? null, actor?.role ?? 'ADMIN');
    res.json({ success: true, data: staff });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update status';
    const code = message === 'ADMIN_ONLY' || message === 'ROLE_BLOCKED' ? 'FORBIDDEN' : 'UPDATE_ERROR';
    const status = code === 'FORBIDDEN' ? 403 : 404;
    res.status(status).json({ success: false, error: { code, message } });
  }
}
