import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

const serializeTable = (table: {
  id: string;
  number: number;
  capacity: number;
  qrToken: string;
  status: 'FREE' | 'OCCUPIED' | 'BILL_REQUESTED';
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: table.id,
  number: table.number,
  capacity: table.capacity,
  qrToken: table.qrToken,
  status: table.status,
  qrUrl: `${env.CLIENT_URL}/t/${table.qrToken}`,
  createdAt: table.createdAt.toISOString(),
  updatedAt: table.updatedAt.toISOString(),
});

export async function listTables() {
  const tables = await prisma.diningTable.findMany({
    orderBy: [{ number: 'asc' }],
  });

  return tables.map(serializeTable);
}

export async function getTableByToken(qrToken: string) {
  const table = await prisma.diningTable.findUnique({
    where: { qrToken },
  });

  if (!table) {
    throw new Error('TABLE_NOT_FOUND');
  }

  return serializeTable(table);
}

export async function createTable(input: { number?: number; capacity?: number; qrToken?: string }) {
  const number = input.number ?? Math.floor(Math.random() * 900) + 100;
  const capacity = input.capacity ?? 4;
  const qrToken = input.qrToken ?? crypto.randomBytes(8).toString('hex');

  const table = await prisma.diningTable.create({
    data: {
      number,
      capacity,
      qrToken,
      status: 'FREE',
    },
  });

  return serializeTable(table);
}

export async function updateTable(
  id: string,
  input: Partial<{ number: number; capacity: number; status: 'FREE' | 'OCCUPIED' | 'BILL_REQUESTED' }>,
) {
  const table = await prisma.diningTable.update({
    where: { id },
    data: input,
  });

  return serializeTable(table);
}

export async function deleteTable(id: string) {
  await prisma.diningTable.delete({ where: { id } });
  return { deleted: true };
}
