import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { db } from './db/index';
import { sql } from 'drizzle-orm';
import { initSocketIO } from './services/realtime';
import { startTrendingSchedule } from './workers/trending-worker';
import { teamRoutes } from './routes/teams';
import { playerRoutes } from './routes/players';
import { matchRoutes } from './routes/matches';
import { deliveryRoutes } from './routes/deliveries';
import { scorecardRoutes } from './routes/scorecard';
import { inningsRoutes } from './routes/innings';
import { commentaryRoutes } from './routes/commentary';
import { analyticsRoutes } from './routes/analytics';
import { authRoutes } from './routes/auth';
import { formatConfigRoutes } from './routes/format-configs';
import { reviewRoutes } from './routes/reviews';
import { userRoutes } from './routes/users';
import { socialRoutes } from './routes/social';
import { chatRoutes } from './routes/chat';
import { notificationRoutes } from './routes/notifications';
import { fantasyRoutes } from './routes/fantasy';
import { leaderboardRoutes } from './routes/leaderboards';
import { trendingRoutes } from './routes/trending';
import { tournamentRoutes } from './routes/tournaments';
import { startWorkers } from './workers/index';
import { env } from './config';
import { validateEnvironment } from './middleware/env-check';
import { initSentry, registerSentryErrorHandler, flushSentry } from './services/sentry';
import { registerMetrics } from './middleware/metrics';
import { registerRequestLogger } from './middleware/request-logger';
import { getRedisClient } from './services/cache';

// Initialize Sentry before anything else so startup errors are captured
initSentry();

// Block startup if critical env vars are missing or invalid
validateEnvironment();

const PORT = env.PORT;
const HOST = env.HOST;

async function buildApp() {
  // Create shared HTTP server so both Fastify and Socket.IO use the same port
  const httpServer = createServer();

  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    },
    serverFactory: (handler) => {
      httpServer.on('request', handler);
      return httpServer;
    },
  });

  // ─── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);

    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }

    return reply.status(error.statusCode || 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      },
    });
  });

  // ─── Sentry error tracking (captures 5xx only) ───────────────────────────
  registerSentryErrorHandler(app);

  // ─── Observability middleware ─────────────────────────────────────────────
  await registerMetrics(app);
  await registerRequestLogger(app);

  await app.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? env.ALLOWED_ORIGINS.split(',')
      : true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for development (enable in production)
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  // Multipart file uploads (avatar etc.)
  await app.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024 } });

  // Serve uploaded files (avatars etc.)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uploadsDir = path.resolve(__dirname, '../uploads');
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Rate limiting — global: 100 requests/minute
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // JWT — context.md section 6.4
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  // ─── OpenAPI / Swagger ───────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'CricScore API',
        description: 'Cricket scoring platform API',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3001' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // ─── Request correlation IDs ──────────────────────────────────────────────
  app.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();
    (request as any).requestId = requestId;
    reply.header('x-request-id', requestId);
    request.log = request.log.child({ requestId });
  });

  // ─── Health check (used by Docker, load balancer, monitoring) ──────────────
  app.get('/health', async (_request, reply) => {
    const health: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`,
      version: process.env.APP_VERSION || process.env.npm_package_version || '0.0.0',
    };

    // Check database
    try {
      await db.execute(sql`SELECT 1`);
      health.database = 'ok';
    } catch {
      health.database = 'error';
      health.status = 'degraded';
    }

    // Check Redis
    try {
      const redis = getRedisClient();
      if (redis) {
        const pong = await redis.ping();
        health.redis = pong === 'PONG' ? 'ok' : 'error';
      } else {
        health.redis = 'unavailable';
      }
    } catch {
      health.redis = 'error';
      health.status = 'degraded';
    }

    // If any dependency is down, return 503
    const isHealthy = health.database === 'ok' && health.redis !== 'error';
    if (!isHealthy) {
      health.status = 'degraded';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(health);
  });

  // Auth middleware — context.md section 6.4
  // Skip auth for health check and auth endpoints; allow unauthenticated in dev mode
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    if (url === '/health' || url === '/metrics' || url.startsWith('/api/v1/auth') || url.startsWith('/docs')) return;

    const authHeader = request.headers.authorization;
    if (!authHeader) return; // Allow unauthenticated access (dev mode)

    try {
      const decoded = await request.jwtVerify();
      (request as any).user = decoded;
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid token' });
    }
  });

  // ─── REST API routes — context.md section 6.1 ────────────────────────────

  // Match management
  app.register(matchRoutes, { prefix: '/api/v1/matches' });

  // Scoring
  app.register(deliveryRoutes, { prefix: '/api/v1/matches' });

  // Scorecard & Commentary
  app.register(scorecardRoutes, { prefix: '/api/v1/matches' });
  app.register(commentaryRoutes, { prefix: '/api/v1/matches' });

  // Innings
  app.register(inningsRoutes, { prefix: '/api/v1/matches' });

  // Players & Teams
  app.register(playerRoutes, { prefix: '/api/v1/players' });
  app.register(teamRoutes, { prefix: '/api/v1/teams' });

  // Analytics — context.md section 6.1
  app.register(analyticsRoutes, { prefix: '/api/v1/analytics' });

  // Auth — context.md section 6.4
  app.register(authRoutes, { prefix: '/api/v1/auth' });

  // Format configs — context.md section 5.8
  app.register(formatConfigRoutes, { prefix: '/api/v1/format-configs' });

  // Reviews (DRS) — context.md section 5.9
  app.register(reviewRoutes, { prefix: '/api/v1/matches' });

  // Users (GDPR) — context.md section 6.1
  app.register(userRoutes, { prefix: '/api/v1/users' });

  // Social — follow system & feed (Phase 2B-2F)
  app.register(socialRoutes, { prefix: '/api/v1/users' });

  // Chat — messaging (Phase 2B-2F)
  app.register(chatRoutes, { prefix: '/api/v1/chat' });

  // Notifications (Phase 2B-2F)
  app.register(notificationRoutes, { prefix: '/api/v1/notifications' });

  // Fantasy (Phase 2B-2F)
  app.register(fantasyRoutes, { prefix: '/api/v1/fantasy' });

  // Leaderboards (Phase 2B-2F)
  app.register(leaderboardRoutes, { prefix: '/api/v1/leaderboards' });

  // Trending (Phase 2B-2F)
  app.register(trendingRoutes, { prefix: '/api/v1/trending' });

  // Tournaments (Sprint 6)
  app.register(tournamentRoutes, { prefix: '/api/v1/tournaments' });

  // Attach Socket.IO to the shared HTTP server
  await initSocketIO(httpServer);

  // Start trending BullMQ repeatable job
  await startTrendingSchedule();

  return { app, httpServer };
}

async function start() {
  const { app, httpServer } = await buildApp();
  await app.ready();

  startWorkers();

  httpServer.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log(`WebSocket server ready`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down gracefully...`);
    try {
      await flushSentry();
      await app.close();
      httpServer.close();
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

export { buildApp };
