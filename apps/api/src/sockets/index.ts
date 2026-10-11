import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';

import { appRoles, type AppRole } from '@restaurant/shared';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

type SocketUser = {
  id: string;
  role: AppRole;
};

const getCookie = (cookieHeader: string | undefined, name: string) => {
  const cookie = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
};

const getSocketUser = async (socket: Socket): Promise<SocketUser | null> => {
  const authToken = socket.handshake.auth?.token;
  const token = typeof authToken === 'string'
    ? authToken
    : getCookie(socket.handshake.headers.cookie, 'token');
  if (!token) return null;

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (error: unknown) {
    if (error instanceof jwt.JsonWebTokenError) return null;
    throw error;
  }
  if (typeof payload === 'string' || typeof payload.userId !== 'string' || typeof payload.role !== 'string') return null;
  if (!appRoles.includes(payload.role as AppRole)) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isActive: true },
  });
  return user?.isActive ? { id: user.id, role: user.role } : null;
};

const mayJoinStaffRoom = (room: string, role: AppRole) => {
  if (room === 'kitchen') return ['CHEF', 'MANAGER', 'ADMIN'].includes(role);
  if (room === 'waiters') return ['WAITER', 'CASHIER', 'MANAGER', 'ADMIN'].includes(role);
  if (room === 'admin') return role === 'ADMIN' || role === 'MANAGER';
  return false;
};

const staffRoles: AppRole[] = ['WAITER', 'CHEF', 'CASHIER', 'MANAGER', 'ADMIN'];

export function registerSocketHandlers(io: Server) {
  io.use((socket, next) => {
    void getSocketUser(socket).then((user) => {
      if (user) socket.data.user = user;
      next();
    }).catch((error: unknown) => {
      logger.error({ event: 'SOCKET_AUTHENTICATION_FAILED', error });
      next(new Error('Socket authentication failed.'));
    });
  });

  io.on('connection', (socket: Socket) => {
    socket.on('join-room', async (requestedRoom: unknown, credentialOrAck?: unknown, maybeAck?: unknown) => {
      // Signature: join-room(room, ack) or join-room(room, { qrToken }, ack).
      const acknowledge = typeof credentialOrAck === 'function' ? credentialOrAck
        : typeof maybeAck === 'function' ? maybeAck : undefined;
      const credential = typeof credentialOrAck === 'object' && credentialOrAck !== null
        ? credentialOrAck as { qrToken?: unknown }
        : undefined;

      if (typeof requestedRoom !== 'string') {
        acknowledge?.({ joined: false });
        return;
      }

      try {
        const user = await getSocketUser(socket);
        if (user) socket.data.user = user;
        const qrToken = typeof credential?.qrToken === 'string' ? credential.qrToken : undefined;

        if (requestedRoom.startsWith('order:')) {
          const orderId = requestedRoom.slice('order:'.length);
          const order = orderId ? await prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, table: { select: { qrToken: true } } },
          }) : null;
          // Staff may watch any order; customers only their own table's order (B-08).
          const allowed = order && (
            (user && staffRoles.includes(user.role))
            || (!user && qrToken !== undefined && order.table?.qrToken === qrToken)
          );
          if (allowed) {
            await socket.join(requestedRoom);
            acknowledge?.({ joined: true });
            return;
          }
        }

        if (user && mayJoinStaffRoom(requestedRoom, user.role)) {
          await socket.join(requestedRoom);
          acknowledge?.({ joined: true });
          return;
        }

        if (requestedRoom.startsWith('table:')) {
          const tableId = requestedRoom.slice('table:'.length);
          const table = tableId ? await prisma.diningTable.findUnique({ where: { id: tableId }, select: { id: true, qrToken: true } }) : null;
          // Staff on the floor, or the customer seated at this table (B-13).
          const allowed = table && (
            (user && ['WAITER', 'CASHIER', 'MANAGER', 'ADMIN'].includes(user.role))
            || (!user && qrToken !== undefined && table.qrToken === qrToken)
          );
          if (allowed) {
            await socket.join(requestedRoom);
            acknowledge?.({ joined: true });
            return;
          }
        }
      } catch (error: unknown) {
        logger.error({ event: 'SOCKET_ROOM_JOIN_FAILED', room: requestedRoom, error });
        acknowledge?.({ joined: false });
        return;
      }

      acknowledge?.({ joined: false });
    });

    socket.on('leave-room', (requestedRoom: unknown) => {
      if (typeof requestedRoom === 'string') {
        void socket.leave(requestedRoom);
      }
    });
  });
}
