import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry error tracking for the React frontend.
 * Call once before rendering the app.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] VITE_SENTRY_DSN not set — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || 'web@0.0.0',
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    Sentry.captureException(event.reason || new Error('Unhandled promise rejection'));
  });

  console.log('[Sentry] Initialized for environment:', import.meta.env.MODE);
}

/**
 * Set the current user context for Sentry.
 * Call after login or when user context is available.
 */
export function setSentryUser(user: { id: string; username?: string; email?: string } | null): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  if (user) {
    Sentry.setUser({ id: user.id, username: user.username, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Sentry ErrorBoundary component — re-exported for convenience.
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;
