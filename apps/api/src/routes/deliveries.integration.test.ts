import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config';

vi.mock('../db/index', () => ({
  db: {
    query: {
      innings: {
        findFirst: vi.fn(),
      },
      delivery: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('../engine/scoring-engine', () => ({
  scoringEngine: {
    recordDelivery: vi.fn(),
    undoLastBall: vi.fn(),
    correctDelivery: vi.fn(),
  },
}));

vi.mock('../services/scoring-orchestrator', () => ({
  orchestrateDeliveryRecorded: vi.fn(),
  orchestrateDeliveryUndone: vi.fn(),
}));

import { scoringEngine } from '../engine/scoring-engine';
import { orchestrateDeliveryRecorded } from '../services/scoring-orchestrator';
import { deliveryRoutes } from './deliveries';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const POST_URL = `/api/v1/matches/${MATCH_ID}/deliveries`;

const validDeliveryBody = {
  innings_num: 1,
  bowler_id: '22222222-2222-4222-8222-222222222222',
  striker_id: '33333333-3333-4333-8333-333333333333',
  non_striker_id: '44444444-4444-4444-8444-444444444444',
  runs_batsman: 1,
};

describe('POST /api/v1/matches/:id/deliveries', () => {
  let app: ReturnType<typeof Fastify>;
  const originalAllowDevAuth = env.ALLOW_DEV_AUTH;

  beforeAll(async () => {
    env.ALLOW_DEV_AUTH = false;
    app = Fastify();
    await app.register(fastifyJwt, { secret: 'test-secret' });

    app.addHook('onRequest', async (request: FastifyRequest) => {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = await request.jwtVerify();
          (request as any).user = decoded;
        } catch {
          // leave user unset — route preHandler will reject
        }
      }
    });

    await app.register(deliveryRoutes, { prefix: '/api/v1/matches' });
    await app.ready();
  });

  afterAll(async () => {
    env.ALLOW_DEV_AUTH = originalAllowDevAuth;
    await app.close();
  });

  function signToken(roles: string[]) {
    return app.jwt.sign({ sub: 'user-123', roles });
  }

  it('returns 401 without authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: POST_URL,
      payload: validDeliveryBody,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Authentication required' });
    expect(scoringEngine.recordDelivery).not.toHaveBeenCalled();
    expect(orchestrateDeliveryRecorded).not.toHaveBeenCalled();
  });

  it('returns 403 for spectator role', async () => {
    const token = signToken(['spectator']);
    const res = await app.inject({
      method: 'POST',
      url: POST_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: validDeliveryBody,
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
    expect(scoringEngine.recordDelivery).not.toHaveBeenCalled();
    expect(orchestrateDeliveryRecorded).not.toHaveBeenCalled();
  });

  it('returns 400 with validation errors for invalid body', async () => {
    const token = signToken(['scorer']);
    const res = await app.inject({
      method: 'POST',
      url: POST_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid request body');
    expect(body.error.details).toBeDefined();
    expect(body.error.details.innings_num).toBeDefined();
    expect(body.error.details.bowler_id).toBeDefined();
    expect(body.error.details.striker_id).toBeDefined();
    expect(body.error.details.non_striker_id).toBeDefined();
    expect(scoringEngine.recordDelivery).not.toHaveBeenCalled();
    expect(orchestrateDeliveryRecorded).not.toHaveBeenCalled();
  });
});
