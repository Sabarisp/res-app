import request from 'supertest';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

jest.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: jest.fn(() => 'signed-token'),
  },
}));

describe('auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in an active user and issues a token', async () => {
    const user = {
      id: 'user_123',
      email: 'admin@tavola.app',
      phone: '9999999999',
      name: 'Admin User',
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      passwordHash: 'hash',
    };

    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const response = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@tavola.app', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('admin@tavola.app');
    expect(response.body.data.token).toBeUndefined();
    expect(response.headers['set-cookie']).toBeDefined();
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: 'user_123', role: 'ADMIN' },
      expect.any(String),
      { expiresIn: '7d' },
    );
    expect(prisma.user.findFirst).toHaveBeenCalled();
  });

  it('blocks deactivated users before checking their password', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'user_inactive',
      email: 'inactive@tavola.app',
      phone: null,
      name: 'Inactive User',
      role: 'WAITER',
      isActive: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      passwordHash: 'hash',
    });

    const response = await request(app)
      .post('/auth/login')
      .send({ identifier: 'inactive@tavola.app', password: 'password123' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('USER_INACTIVE');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});
