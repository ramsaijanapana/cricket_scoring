import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RequestLogEntry {
  level: string;
  timestamp: string;
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Structured JSON request logger middleware.
 * Logs every request with method, URL, status, duration, and user context.
 * Uses stdout JSON for log aggregation (ELK, Loki, CloudWatch, etc.).
 */
export async function registerRequestLogger(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any)._requestLogStart = performance.now();
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const start = (request as any)._requestLogStart;
    if (start === undefined) return;

    // Skip noisy health/metrics endpoints from request logs
    if (request.url === '/health' || request.url === '/metrics') return;

    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const user = (request as any).user;
    const requestId = (request as any).requestId || reply.getHeader('x-request-id') || '-';

    const entry: RequestLogEntry = {
      level: reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info',
      timestamp: new Date().toISOString(),
      requestId: String(requestId),
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs,
    };

    if (user?.id) {
      entry.userId = user.id;
    }

    const userAgent = request.headers['user-agent'];
    if (userAgent) {
      entry.userAgent = userAgent;
    }

    entry.ip = request.ip;

    // Structured JSON to stdout — compatible with log aggregators
    process.stdout.write(JSON.stringify(entry) + '\n');
  });
}
