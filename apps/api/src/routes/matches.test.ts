import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const BATTING_TEAM_ID = '22222222-2222-4222-8222-222222222222';
const BOWLING_TEAM_ID = '33333333-3333-4333-8333-333333333333';
const START_URL = `/api/v1/matches/${MATCH_ID}/start`;

const battingOrder = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
];

const mockInnings = {
  id: 'innings-1111-4111-8111-111111111111',
  matchId: MATCH_ID,
  inningsNumber: 1,
  battingTeamId: BATTING_TEAM_ID,
  bowlingTeamId: BOWLING_TEAM_ID,
  status: 'in_progress',
  startedAt: new Date('2024-06-01T10:00:00.000Z'),
};

const dbMocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  return {
    matchFindFirst: vi.fn(),
    matchTeamFindFirst: vi.fn(),
    update,
    set,
    where,
    returning,
    insert,
    values,
  };
});

vi.mock('../db/index', () => ({
  db: {
    query: {
      match: { findFirst: dbMocks.matchFindFirst },
      matchTeam: { findFirst: dbMocks.matchTeamFindFirst },
    },
    update: dbMocks.update,
    insert: dbMocks.insert,
  },
}));

import { matchRoutes } from './matches';

describe('POST /api/v1/matches/:id/start', () => {
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

    await app.register(matchRoutes, { prefix: '/api/v1/matches' });
    await app.ready();
  });

  afterAll(async () => {
    env.ALLOW_DEV_AUTH = originalAllowDevAuth;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.returning.mockResolvedValue([mockInnings]);
    dbMocks.matchTeamFindFirst.mockResolvedValue({
      matchId: MATCH_ID,
      teamId: BOWLING_TEAM_ID,
      playingXi: ['bowler-1', 'bowler-2'],
    });
  });

  function signToken() {
    return app.jwt.sign({ sub: 'user-123', roles: ['scorer'] });
  }

  const startPayload = {
    battingTeamId: BATTING_TEAM_ID,
    bowlingTeamId: BOWLING_TEAM_ID,
    battingOrder,
  };

  it('returns 401 without authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: START_URL,
      payload: startPayload,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Authentication required' });
    expect(dbMocks.matchFindFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when match not found', async () => {
    dbMocks.matchFindFirst.mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: START_URL,
      headers: { authorization: `Bearer ${signToken()}` },
      payload: startPayload,
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Match not found' });
  });

  it('starts match and returns 201 with first innings', async () => {
    dbMocks.matchFindFirst.mockResolvedValueOnce({ id: MATCH_ID, status: 'scheduled' });

    const res = await app.inject({
      method: 'POST',
      url: START_URL,
      headers: { authorization: `Bearer ${signToken()}` },
      payload: startPayload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      id: mockInnings.id,
      matchId: MATCH_ID,
      inningsNumber: 1,
      battingTeamId: BATTING_TEAM_ID,
      bowlingTeamId: BOWLING_TEAM_ID,
      status: 'in_progress',
    });
  });

  it('updates match status to live before creating innings', async () => {
    dbMocks.matchFindFirst.mockResolvedValueOnce({ id: MATCH_ID, status: 'toss' });

    await app.inject({
      method: 'POST',
      url: START_URL,
      headers: { authorization: `Bearer ${signToken()}` },
      payload: startPayload,
    });

    expect(dbMocks.update).toHaveBeenCalled();
    expect(dbMocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'live', actualStart: expect.any(Date) }),
    );
    expect(dbMocks.insert).toHaveBeenCalled();
  });

  it('initializes batting, bowling, and fielding scorecards', async () => {
    dbMocks.matchFindFirst.mockResolvedValueOnce({ id: MATCH_ID, status: 'scheduled' });

    await app.inject({
      method: 'POST',
      url: START_URL,
      headers: { authorization: `Bearer ${signToken()}` },
      payload: startPayload,
    });

    expect(dbMocks.insert).toHaveBeenCalledTimes(4);
    expect(dbMocks.matchTeamFindFirst).toHaveBeenCalledOnce();
  });
});
