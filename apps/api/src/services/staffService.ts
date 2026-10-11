import { randomBytes } from 'node:crypto';

import { AppRole, UserDto } from '@restaurant/shared';
import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';

const generateTemporaryPassword = () => randomBytes(18).toString('base64url');

export type StaffMember = UserDto & {
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

export type AuditEntry = {
  id: string;
  action: string;
  details: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    role: AppRole;
  } | null;
};

const isPrivileged = (role: AppRole) => role === 'ADMIN' || role === 'MANAGER';

const canManageTarget = (actorRole: AppRole, targetRole: AppRole) => {
  if (!isPrivileged(targetRole)) {
    return true;
  }

  return actorRole === 'ADMIN';
};

const sanitizeUser = (user: {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: AppRole;
  isActive: boolean;
  createdAt: Date;
}): StaffMember => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  name: user.name,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt.toISOString(),
});

const createAudit = async (actorId: string | null, action: string, details: string) => {
  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action,
      details,
    },
  });
};

export async function listStaff(): Promise<StaffMember[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return users.map(sanitizeUser);
}

export async function listAuditLog(): Promise<AuditEntry[]> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  });

  return logs.map((entry) => ({
    id: entry.id,
    action: entry.action,
    details: entry.details,
    createdAt: entry.createdAt.toISOString(),
    user: entry.user
      ? {
          id: entry.user.id,
          name: entry.user.name,
          role: entry.user.role as AppRole,
        }
      : null,
  }));
}

export async function createStaff(
  input: { name: string; email?: string | null; phone?: string | null; role: AppRole },
  actorId: string | null,
  actorRole: AppRole,
): Promise<{ staff: StaffMember; tempPassword: string }> {
  const role = input.role;

  if (!canManageTarget(actorRole, role)) {
    throw new Error('ADMIN_ONLY');
  }

  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;

  if (!email && !phone) {
    throw new Error('Either email or phone is required');
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: email ? { equals: email, mode: 'insensitive' } : undefined }, { phone: phone || undefined }],
    },
  });

  if (existing) {
    throw new Error('A staff member with that email or phone already exists');
  }

  const tempPassword = generateTemporaryPassword();
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      phone,
      role,
      passwordHash: await bcrypt.hash(tempPassword, 10),
      isActive: true,
    },
  });

  await createAudit(actorId, 'CREATE_STAFF', `${user.name} assigned role ${user.role}`);

  return { staff: sanitizeUser(user), tempPassword };
}

export async function updateStaff(
  id: string,
  input: Partial<{ name: string; email: string | null; phone: string | null; role: AppRole; isActive: boolean }>,
  actorId: string | null,
  actorRole: AppRole,
): Promise<StaffMember> {
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) {
    throw new Error('User not found');
  }

  const nextRole = input.role ?? current.role;
  if (!canManageTarget(actorRole, nextRole)) {
    throw new Error('ADMIN_ONLY');
  }

  if (input.role && input.role !== current.role && isPrivileged(input.role) && actorRole !== 'ADMIN') {
    throw new Error('ROLE_BLOCKED');
  }

  const payload: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    role?: AppRole;
    isActive?: boolean;
  } = {};

  if (typeof input.name === 'string') payload.name = input.name.trim();
  if (typeof input.email === 'string' || input.email === null) payload.email = input.email?.trim() || null;
  if (typeof input.phone === 'string' || input.phone === null) payload.phone = input.phone?.trim() || null;
  if (input.role) payload.role = input.role;
  if (typeof input.isActive === 'boolean') payload.isActive = input.isActive;

  const updated = await prisma.user.update({ where: { id }, data: payload });
  await createAudit(actorId, 'UPDATE_STAFF', `${current.name} updated to ${updated.name} (${updated.role})`);

  return sanitizeUser(updated);
}

export async function resetPassword(
  id: string,
  password: string | undefined,
  actorId: string | null,
  actorRole: AppRole,
): Promise<{ message: string; tempPassword: string }> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new Error('User not found');
  }

  if (isPrivileged(user.role) && actorRole !== 'ADMIN') {
    throw new Error('ADMIN_ONLY');
  }

  const nextPassword = password || generateTemporaryPassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(nextPassword, 10) },
  });

  await createAudit(actorId, 'RESET_PASSWORD', `${user.name} password reset by ${actorId ?? 'system'}`);

  return { message: 'Password reset successfully', tempPassword: nextPassword };
}

export async function toggleStatus(
  id: string,
  isActive: boolean,
  actorId: string | null,
  actorRole: AppRole,
): Promise<StaffMember> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new Error('User not found');
  }

  if (isPrivileged(user.role) && actorRole !== 'ADMIN') {
    throw new Error('ADMIN_ONLY');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive },
  });

  await createAudit(actorId, 'TOGGLE_STATUS', `${updated.name} set active=${updated.isActive}`);

  return sanitizeUser(updated);
}
