import { AppRole, LoginInput, UserDto } from '@restaurant/shared';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export async function loginUser(input: LoginInput): Promise<{ token: string; user: UserDto }> {
  const { identifier, password } = input;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: identifier, mode: 'insensitive' } },
        { phone: identifier },
      ],
    },
  });

  if (!user) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new Error('USER_INACTIVE');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '7d' },
  );

  const userDto: UserDto = {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role as AppRole,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };

  return { token, user: userDto };
}

export async function getUserById(userId: string): Promise<UserDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    throw new Error('USER_NOT_FOUND');
  }

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role as AppRole,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}
