import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { createServer } from 'http';
import { initSocketIO } from './services/realtime';
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

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function buildApp() {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    },
  });

  await app.register(cors, { origin: true });

  // JWT — context.md section 6.4
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

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

  return app;
}

async function start() {
  const app = await buildApp();
  await app.ready();

  // Create HTTP server and attach Socket.IO — context.md section 3
  const httpServer = createServer(app.server);
  initSocketIO(httpServer);

  httpServer.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log(`WebSocket server ready`);
  });
}

start().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

export { buildApp };
