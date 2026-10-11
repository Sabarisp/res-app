import { prisma } from '../src/lib/prisma.js';
import { createStaff } from '../src/services/staffService.js';

jest.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: { findFirst: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

describe('staff account security', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prevents managers from creating admin or manager accounts', async () => {
    await expect(createStaff({
      name: 'New admin',
      email: 'new-admin@tavola.app',
      role: 'ADMIN',
    }, 'manager-1', 'MANAGER')).rejects.toThrow('ADMIN_ONLY');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates staff with a random one-time password and never stores it in audit details', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
      ...data,
      id: 'waiter-1',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
    }));
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await createStaff({
      name: 'New waiter',
      email: 'waiter@tavola.app',
      role: 'WAITER',
    }, 'admin-1', 'ADMIN');

    expect(result.staff.id).toBe('waiter-1');
    expect(result.tempPassword).toHaveLength(24);
    expect(result.tempPassword).not.toBe('Welcome@123');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'CREATE_STAFF',
        details: expect.not.stringContaining(result.tempPassword),
      }),
    }));
  });
});
