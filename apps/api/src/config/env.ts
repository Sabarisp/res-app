import { z } from 'zod';

const parseAllowedOrigins = (rawValue?: string, fallback: string[] = []) => {
  if (!rawValue) {
    return fallback;
  }

  return rawValue
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  DATABASE_URL: z.string().min(1).default('postgresql://localhost:5432/restaurant'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RAZORPAY_KEY_ID: z.string().trim().default(''),
  RAZORPAY_KEY_SECRET: z.string().trim().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().trim().default(''),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'test' && /^(change-me|development-secret|replace-with)/i.test(value.JWT_SECRET)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET must be a generated secret, not a placeholder.',
    });
  }
});

export const env = envSchema.parse(process.env);
export const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS, [env.CLIENT_URL]);
