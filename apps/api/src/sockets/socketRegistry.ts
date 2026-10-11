import type { Server } from 'socket.io';

let socketServer: Server | null = null;

export function setSocketServer(server: Server) {
  socketServer = server;
}

export function emitToRoom(room: string, event: string, payload: unknown) {
  if (!socketServer) {
    return;
  }

  socketServer.to(room).emit(event, payload);
}

export function emitToAll(event: string, payload: unknown) {
  if (!socketServer) return;
  socketServer.emit(event, payload);
}

export function emitToAdmin(event: string, payload: unknown) {
  emitToRoom('admin', event, payload);
}
