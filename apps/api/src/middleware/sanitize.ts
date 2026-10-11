import type { NextFunction, Request, Response } from 'express';

function sanitizeString(value: string): string {
  return Array.from(value.replace(/<[^>]*>/g, '')).filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').trim();
}

export function sanitizeInputValue<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInputValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sanitizeInputValue(nestedValue),
      ]),
    ) as T;
  }

  return value;
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInputValue(req.body) as typeof req.body;
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeInputValue(req.query) as typeof req.query;
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeInputValue(req.params) as typeof req.params;
  }

  next();
}
