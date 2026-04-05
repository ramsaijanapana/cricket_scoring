import { env } from '../config';

/**
 * Startup environment validation.
 *
 * Call this before initialising the server to ensure critical services
 * are reachable and secrets are not left at their default dev values in
 * production.
 *
 * Throws an error (blocking server startup) if any check fails.
 */
export function validateEnvironment(): void {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === 'production';

  // ── Critical: database URL must be set ────────────────────────────────
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set — the API cannot start without a database.');
  }

  // ── Production-only checks ────────────────────────────────────────────
  if (isProduction) {
    if (env.JWT_SECRET.includes('change') || env.JWT_SECRET.includes('dev-')) {
      errors.push('JWT_SECRET appears to be a placeholder — set a real secret for production.');
    }

    if (env.JWT_REFRESH_SECRET.includes('change') || env.JWT_REFRESH_SECRET.includes('dev-')) {
      errors.push('JWT_REFRESH_SECRET appears to be a placeholder — set a real secret for production.');
    }

    if (!env.SMTP_HOST) {
      errors.push('SMTP_HOST is not configured — email delivery will fail in production.');
    }

    if (env.ALLOWED_ORIGINS === 'http://localhost:5173') {
      errors.push('ALLOWED_ORIGINS is still set to localhost — configure production origins.');
    }

    if (env.REDIS_URL === 'redis://localhost:6379') {
      errors.push('REDIS_URL is set to localhost — configure a production Redis instance.');
    }
  }

  if (errors.length > 0) {
    const separator = '========================================';
    const message = [
      '',
      separator,
      ' STARTUP BLOCKED: Environment check failed',
      separator,
      ...errors.map((e) => `  ✗ ${e}`),
      separator,
      '',
    ].join('\n');

    throw new Error(message);
  }

  // Log successful validation (non-sensitive summary)
  console.log(`[env-check] Environment validated for ${env.NODE_ENV}`);
  console.log(`[env-check] Database: ${env.DATABASE_URL.replace(/\/\/.*@/, '//***@')}`);
  console.log(`[env-check] Redis: ${env.REDIS_URL}`);
  console.log(`[env-check] Features: fantasy=${env.FEATURE_FANTASY}, chat=${env.FEATURE_CHAT}`);
}
