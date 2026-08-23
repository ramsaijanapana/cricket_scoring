import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config';

const TOURNAMENT_ID = '11111111-1111-4111-8111-111111111111';
const BASE_URL = '/api/v1/tournaments';

const mockTournament = {
  id: TOURNAMENT_ID,
  name: 'Summer League',
  format: 't20',
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-08-01'),
  createdAt: new Date('2026-06-01'),
};

const dbMocks = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  return {
    tournamentFindMany: vi.fn(),
    tournamentFindFirst: vi.fn(),
    matchFindMany: vi.fn(),
    matchTeamFindMany: vi.fn(),
    teamFindMany: vi.fn(),
    inningsFindMany: vi.fn(),
    returning,
    values,
    insert,
  };
});

vi.mock('../db/index', () => ({
  db: {
    query: {
      tournament: {
        findMany: dbMocks.tournamentFindMany,
        findFirst: dbMocks.tournamentFindFirst,
      },
      match: { findMany: dbMocks.matchFindMany },
      matchTeam: { findMany: dbMocks.matchTeamFindMany },
      team: { findMany: dbMocks.teamFindMany },
      innings: { findMany: dbMocks.inningsFindMany },
    },
    insert: dbMocks.insert,
  },
}));

import { tournamentRoutes } from './tournaments';

describe('Tournament routes', () => {
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

    await app.register(tournamentRoutes, { prefix: BASE_URL });
    await app.ready();
  });

  afterAll(async () => {
    env.ALLOW_DEV_AUTH = originalAllowDevAuth;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.returning.mockResolvedValue([mockTournament]);
    dbMocks.matchFindMany.mockResolvedValue([]);
    dbMocks.matchTeamFindMany.mockResolvedValue([]);
    dbMocks.teamFindMany.mockResolvedValue([]);
    dbMocks.inningsFindMany.mockResolvedValue([]);
  });

  function signToken() {
    return app.jwt.sign({ sub: 'user-123', roles: ['admin'] });
  }

  it('GET / returns paginated tournaments with computed status', async () => {
    dbMocks.tournamentFindMany.mockResolvedValueOnce([mockTournament]);

    const res = await app.inject({ method: 'GET', url: BASE_URL });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: TOURNAMENT_ID,
      name: 'Summer League',
      status: expect.stringMatching(/upcoming|live|completed/),
    });
    expect(body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('POST / returns 401 without authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: BASE_URL,
      payload: { name: 'New Cup', format: 't20' },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Authentication required' });
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('POST / returns 400 for invalid tournament body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: BASE_URL,
      headers: { authorization: `Bearer ${signToken()}` },
      payload: { name: '', format: 't20' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBeDefined();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('POST / creates tournament and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: BASE_URL,
      headers: { authorization: `Bearer ${signToken()}` },
      payload: { name: 'Winter Cup', format: 'odi', season: '2026' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      id: TOURNAMENT_ID,
      name: 'Summer League',
      teamIds: [],
    });
    expect(dbMocks.insert).toHaveBeenCalledOnce();
  });

  it('GET /:id returns 404 when tournament not found', async () => {
    dbMocks.tournamentFindFirst.mockResolvedValueOnce(undefined);

    const res = await app.inject({ method: 'GET', url: `${BASE_URL}/${TOURNAMENT_ID}` });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Tournament not found' });
  });

  it('GET /:id/points-table returns empty table when no matches exist', async () => {
    dbMocks.tournamentFindFirst.mockResolvedValueOnce(mockTournament);
    dbMocks.matchFindMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: `${BASE_URL}/${TOURNAMENT_ID}/points-table`,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ pointsTable: [] });
  });
});
