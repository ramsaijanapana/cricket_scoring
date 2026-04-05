import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load environment-specific .env file, then fall back to .env
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = `.env.${NODE_ENV}`;
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config(); // fallback to .env (won't override already-set vars)

const isProduction = NODE_ENV === 'production';

// ── Database ────────────────────────────────────────────────────────────────
const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_IDLE_TIMEOUT: z.coerce.number().default(20),
  DB_CONNECT_TIMEOUT: z.coerce.number().default(10),
});

// ── Redis ───────────────────────────────────────────────────────────────────
const redisSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

// ── JWT ─────────────────────────────────────────────────────────────────────
const jwtSchema = z.object({
  JWT_SECRET: isProduction
    ? z.string().min(32, 'JWT_SECRET must be at least 32 characters in production')
    : z.string().default('dev-secret-change-in-production'),
  JWT_REFRESH_SECRET: isProduction
    ? z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters in production')
    : z.string().default('dev-refresh-secret-change-in-production'),
  JWT_ACCESS_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_EXPIRY_DAYS: z.coerce.number().default(7),
});

// ── SMTP / Email ────────────────────────────────────────────────────────────
const smtpSchema = z.object({
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('CricScore <noreply@cricscore.app>'),
  APP_URL: z.string().default('http://localhost:5173'),
});

// ── Storage (S3 / R2) ──────────────────────────────────────────────────────
const storageSchema = z.object({
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default(''),
  S3_CDN_URL: z.string().default(''),
});

// ── Feature Flags ───────────────────────────────────────────────────────────
const featureFlagSchema = z.object({
  FEATURE_FANTASY: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  FEATURE_CHAT: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_NOTIFICATIONS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_LEADERBOARDS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

// ── Server ──────────────────────────────────────────────────────────────────
const serverSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

// ── Combined Schema ─────────────────────────────────────────────────────────
const envSchema = databaseSchema
  .merge(redisSchema)
  .merge(jwtSchema)
  .merge(smtpSchema)
  .merge(storageSchema)
  .merge(featureFlagSchema)
  .merge(serverSchema);

export type Env = z.infer<typeof envSchema>;

// Parse and validate — fail fast with descriptive errors
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  console.error('\n========================================');
  console.error(' ENVIRONMENT CONFIGURATION ERROR');
  console.error('========================================');
  console.error(`Failed to validate environment variables:\n${formatted}`);
  console.error('\nHint: copy .env.example to .env and fill in required values.');
  console.error('========================================\n');

  process.exit(1);
}

export const env = parsed.data;
