import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { allowedOrigins } from './config/env.js';
import { sanitizeRequest } from './middleware/sanitize.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import tableRoutes from './routes/tableRoutes.js';

const app = express();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this client. Please try again later.',
    },
  },
});

const allowedOriginSet = new Set(allowedOrigins);

app.use(apiLimiter);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }),
);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cookieParser());
app.use('/payments', paymentRoutes);
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeRequest);

app.get('/health', (_req, res) => {
  res.json({ success: true });
});

app.use('/auth', authRoutes);
app.use('/coupons', couponRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/menu', menuRoutes);
app.use('/tables', tableRoutes);
app.use('/orders', orderRoutes);
app.use('/reports', reportRoutes);
app.use('/staff', staffRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
