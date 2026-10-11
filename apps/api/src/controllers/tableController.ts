import { Request, Response } from 'express';
import { createDiningTableSchema, qrTokenSchema, updateDiningTableSchema } from '@restaurant/shared';

import { logger } from '../lib/logger.js';
import * as tableService from '../services/tableService.js';

export async function listTables(_req: Request, res: Response) {
  try {
    const data = await tableService.listTables();
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load tables';
    res.status(500).json({ success: false, error: { code: 'TABLE_ERROR', message } });
  }
}

export async function getTableByToken(req: Request, res: Response) {
  const parsed = qrTokenSchema.safeParse(req.params.qrToken);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'INVALID_QR_TOKEN', message: 'This QR link is not valid.' } });
    return;
  }

  try {
    const data = await tableService.getTableByToken(parsed.data);
    res.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'TABLE_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: 'TABLE_NOT_FOUND', message: 'This QR link does not match an active table.' } });
      return;
    }

    logger.error({ event: 'TABLE_LOOKUP_FAILED', error });
    res.status(500).json({ success: false, error: { code: 'TABLE_LOOKUP_FAILED', message: 'Unable to verify this table link right now. Please try again.' } });
  }
}

export async function createTable(req: Request, res: Response) {
  const parsed = createDiningTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid table payload' } });
    return;
  }

  try {
    const data = await tableService.createTable(parsed.data);
    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create table';
    res.status(400).json({ success: false, error: { code: 'CREATE_ERROR', message } });
  }
}

export async function updateTable(req: Request, res: Response) {
  const parsed = updateDiningTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid table update' } });
    return;
  }

  try {
    const data = await tableService.updateTable(req.params.id, parsed.data);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update table';
    res.status(404).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
}

export async function deleteTable(req: Request, res: Response) {
  try {
    const data = await tableService.deleteTable(req.params.id);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete table';
    res.status(404).json({ success: false, error: { code: 'DELETE_ERROR', message } });
  }
}
