import * as Sentry from '@sentry/node';
import type { FastifyInstance, FastifyError } from 'fastify';
import { env } from '../config';

/**
 * Initialize Sentry error tracking for the API server.
 * Call once during server startup before registering routes.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not set — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    release: process.env.APP_VERSION || `api@${process.env.npm_package_version || '0.0.0'}`,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
    // Don't send expected errors (validation, auth, not-found)
    beforeSend(event, hint) {
      const error = hint?.originalException;
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode && statusCode < 500) {
          return null;
        }
      }
      return event;
    },
  });

  console.log('[Sentry] Initialized for environment:', env.NODE_ENV);
}

/**
 * Expected error status codes that should NOT be reported to Sentry.
 */
const EXPECTED_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422, 429]);

/**
 * Register a Fastify error handler that captures unexpected exceptions to Sentry.
 * This wraps the existing error handler — call after setting setErrorHandler.
 */
export function registerSentryErrorHandler(app: FastifyInstance): void {
  if (!process.env.SENTRY_DSN) return;

  app.addHook('onError', async (request, _reply, error: FastifyError) => {
    const statusCode = error.statusCode || 500;

    // Only capture 5xx errors — skip validation, auth, not-found, etc.
    if (EXPECTED_STATUS_CODES.has(statusCode) || statusCode < 500) {
      return;
    }

    Sentry.withScope((scope) => {
      // Request context
      scope.setTag('url', request.url);
      scope.setTag('method', request.method);
      scope.setTag('statusCode', statusCode.toString());

      // User context
      const user = (request as any).user;
      if (user?.id) {
        scope.setUser({ id: user.id, username: user.username });
      }

      // Extract match ID from URL if present
      const matchIdMatch = request.url.match(/\/matches\/([^/]+)/);
      if (matchIdMatch) {
        scope.setTag('matchId', matchIdMatch[1]);
      }

      // Request ID for correlation
      const requestId = (request as any).requestId;
      if (requestId) {
        scope.setTag('requestId', requestId);
      }

      Sentry.captureException(error);
    });
  });
}

/**
 * Flush pending Sentry events — call during graceful shutdown.
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  await Sentry.close(timeout);
}
