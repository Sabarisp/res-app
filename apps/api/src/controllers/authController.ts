import { loginSchema } from '@restaurant/shared';
import { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import * as authService from '../services/authService.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export async function login(req: Request, res: Response) {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: result.error.errors[0]?.message || 'Invalid login payload',
      },
    });
    return;
  }

  try {
    const { token, user } = await authService.loginUser(result.data);

    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({
      success: true,
      data: { user },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'INVALID_CREDENTIALS') {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email/phone or password' },
      });
      return;
    }

    if (message === 'USER_INACTIVE') {
      res.status(403).json({
        success: false,
        error: { code: 'USER_INACTIVE', message: 'User account is deactivated' },
      });
      return;
    }

    logger.error({ event: 'LOGIN_FAILED', error });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred during login' },
    });
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
}

export async function me(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
    });
    return;
  }

  try {
    const user = await authService.getUserById(req.user.id);
    res.json({
      success: true,
      data: { user },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' },
      });
      return;
    }
    next(error);
  }
}
