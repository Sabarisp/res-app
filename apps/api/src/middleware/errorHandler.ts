import type { NextFunction, Request, Response } from 'express';

import { logger } from '../lib/logger.js';
import { errorResponse } from '../utils/response.js';

export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json(errorResponse('NOT_FOUND', 'Route not found'));
}

export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const statusCode = err.statusCode ?? 500;
  const message = err.message || 'Internal server error';

  logger.error({ statusCode, message, stack: err.stack ?? undefined });

  if (message === 'CORS_ORIGIN_NOT_ALLOWED') {
    return res.status(403).json(errorResponse('CORS_ORIGIN_NOT_ALLOWED', 'This origin is not allowed to access the API.'));
  }

  return res.status(statusCode).json(errorResponse('SERVER_ERROR', message));
}
