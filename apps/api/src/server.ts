import 'dotenv/config';
import { createServer } from 'node:http';

import { Server } from 'socket.io';

import app from './app.js';
import { allowedOrigins, env } from './config/env.js';
import { registerSocketHandlers } from './sockets/index.js';
import { setSocketServer } from './sockets/socketRegistry.js';

const httpServer = createServer(app);
const allowedOriginSet = new Set(allowedOrigins);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
    },
    credentials: true,
  },
});

registerSocketHandlers(io);
setSocketServer(io);

httpServer.listen(env.PORT, () => {
  console.log(`API server running on http://localhost:${env.PORT}`);
});

export { io };
