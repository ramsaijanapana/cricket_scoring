import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
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

    app.addHook('onRequest', async (request) => {
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

  it('rejects a chase ball that restarted the undo stack, and accepts the match sequence', async () => {
    const { db } = await import('../db/index');
    const token = signToken(['scorer']);
    const inProgress = {
      id: '55555555-5555-4555-8555-555555555555',
      status: 'in_progress',
      totalRuns: 0,
      totalWickets: 0,
      targetScore: 121,
    };
    vi.mocked(db.query.innings.findFirst).mockResolvedValue(inProgress as any);
    vi.mocked(db.query.delivery.findFirst).mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      undoStackPos: 40,
    } as any);

    const restarted = await app.inject({
      method: 'POST',
      url: POST_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validDeliveryBody, expected_stack_pos: 1 },
    });

    expect(restarted.statusCode).toBe(409);
    expect(JSON.parse(restarted.body).error.code).toBe('SYNC_CONFLICT');
    expect(scoringEngine.recordDelivery).not.toHaveBeenCalled();

    vi.mocked(scoringEngine.recordDelivery).mockResolvedValue({
      delivery: { id: '77777777-7777-4777-8777-777777777777', undoStackPos: 41 },
      commentary: null,
      overCompleted: false,
      inningsCompleted: false,
      matchCompleted: false,
      newStrikerId: validDeliveryBody.striker_id,
      newNonStrikerId: validDeliveryBody.non_striker_id,
      scorecardSnapshot: {
        innings_score: 1,
        innings_wickets: 0,
        innings_overs: '0.1',
        run_rate: 6,
        powerplay: null,
      },
      dlsParScore: null,
    } as any);

    const continued = await app.inject({
      method: 'POST',
      url: POST_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validDeliveryBody, expected_stack_pos: 40 },
    });

    expect(continued.statusCode).toBe(201);
    expect(scoringEngine.recordDelivery).toHaveBeenCalledTimes(1);
  });
});
