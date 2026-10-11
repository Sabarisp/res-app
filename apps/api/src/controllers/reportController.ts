import { Request, Response } from 'express';

import { reportRangeSchema } from '@restaurant/shared';

import * as reportService from '../services/reportService.js';

const parseRange = (req: Request) => {
  const parsed = reportRangeSchema.safeParse(req.query);

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message || 'Invalid report filter');
  }

  return parsed.data;
};

export async function getSummary(req: Request, res: Response) {
  try {
    const range = parseRange(req);
    const data = await reportService.getSummary(range);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load summary';
    res.status(400).json({ success: false, error: { code: 'REPORT_ERROR', message } });
  }
}

export async function getDailySales(req: Request, res: Response) {
  try {
    const range = parseRange(req);
    const data = await reportService.getDailySales(range);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load sales trend';
    res.status(400).json({ success: false, error: { code: 'REPORT_ERROR', message } });
  }
}

export async function getTopItems(req: Request, res: Response) {
  try {
    const range = parseRange(req);
    const data = await reportService.getTopItems(range);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load top items';
    res.status(400).json({ success: false, error: { code: 'REPORT_ERROR', message } });
  }
}

export async function getPeakHours(req: Request, res: Response) {
  try {
    const range = parseRange(req);
    const data = await reportService.getPeakHours(range);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load peak hours';
    res.status(400).json({ success: false, error: { code: 'REPORT_ERROR', message } });
  }
}

export async function getPaymentModeSplit(req: Request, res: Response) {
  try {
    const range = parseRange(req);
    const data = await reportService.getPaymentModeSplit(range);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load payment mix';
    res.status(400).json({ success: false, error: { code: 'REPORT_ERROR', message } });
  }
}

export async function getGstSummary(req: Request, res: Response) {
  try {
    const range = parseRange(req);
    const data = await reportService.getGstSummary(range);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load GST summary';
    res.status(400).json({ success: false, error: { code: 'REPORT_ERROR', message } });
  }
}

export async function exportCsv(req: Request, res: Response) {
  try {
    const range = parseRange(req);
    const csv = await reportService.getCsvExport(range);
    res
      .status(200)
      .type('text/csv')
      .setHeader('Content-Disposition', 'attachment; filename="tavola-sales.csv"')
      .send(csv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to export report';
    res.status(400).json({ success: false, error: { code: 'REPORT_ERROR', message } });
  }
}
