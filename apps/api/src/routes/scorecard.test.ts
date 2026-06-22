import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const INNINGS_ID = '22222222-2222-4222-8222-222222222222';
const SCORECARD_URL = `/api/v1/matches/${MATCH_ID}/scorecard`;
const INNINGS_SCORECARD_URL = `/api/v1/matches/${MATCH_ID}/innings/${INNINGS_ID}/scorecard`;

const mockInnings = {
  id: INNINGS_ID,
  matchId: MATCH_ID,
  inningsNumber: 1,
  battingTeamId: '33333333-3333-4333-8333-333333333333',
  bowlingTeamId: '44444444-4444-4444-8444-444444444444',
  totalRuns: 120,
  totalWickets: 3,
  totalOvers: '15.2',
  totalExtras: 8,
};

const mockBatting = [
  {
    inningsId: INNINGS_ID,
    playerId: '55555555-5555-4555-8555-555555555555',
    teamId: mockInnings.battingTeamId,
    battingPosition: 1,
    runsScored: 45,
    ballsFaced: 30,
    didNotBat: false,
    isOut: false,
  },
];

const mockBowling = [
  {
    inningsId: INNINGS_ID,
    playerId: '66666666-6666-4666-8666-666666666666',
    teamId: mockInnings.bowlingTeamId,
    bowlingPosition: 1,
    oversBowled: '4.0',
    runsConceded: 28,
    wicketsTaken: 1,
  },
];

const dbMocks = vi.hoisted(() => ({
  inningsFindMany: vi.fn(),
  inningsFindFirst: vi.fn(),
  matchTeamFindMany: vi.fn(),
  teamFindMany: vi.fn(),
  deliveryFindMany: vi.fn(),
  battingFindMany: vi.fn(),
  bowlingFindMany: vi.fn(),
  fieldingFindMany: vi.fn(),
  playerFindMany: vi.fn(),
  selectGroupBy: vi.fn(),
}));

vi.mock('../services/cache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/index', () => ({
  db: {
    query: {
      innings: {
        findMany: dbMocks.inningsFindMany,
        findFirst: dbMocks.inningsFindFirst,
      },
      matchTeam: { findMany: dbMocks.matchTeamFindMany },
      team: { findMany: dbMocks.teamFindMany },
      delivery: { findMany: dbMocks.deliveryFindMany },
      battingScorecard: { findMany: dbMocks.battingFindMany },
      bowlingScorecard: { findMany: dbMocks.bowlingFindMany },
      fieldingScorecard: { findMany: dbMocks.fieldingFindMany },
      player: { findMany: dbMocks.playerFindMany },
      match: { findFirst: vi.fn() },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: dbMocks.selectGroupBy,
        })),
      })),
    })),
  },
}));

import { scorecardRoutes } from './scorecard';

describe('GET /api/v1/matches/:id/scorecard', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(scorecardRoutes, { prefix: '/api/v1/matches' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectGroupBy.mockResolvedValue([]);
    dbMocks.deliveryFindMany.mockResolvedValue([]);
    dbMocks.fieldingFindMany.mockResolvedValue([]);
  });

  it('returns empty array when match has no innings', async () => {
    dbMocks.inningsFindMany.mockResolvedValueOnce([]);

    const res = await app.inject({ method: 'GET', url: SCORECARD_URL });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns enriched scorecard with team and player names', async () => {
    dbMocks.inningsFindMany.mockResolvedValueOnce([mockInnings]);
    dbMocks.matchTeamFindMany.mockResolvedValueOnce([
      { matchId: MATCH_ID, teamId: mockInnings.battingTeamId, designation: 'home' },
      { matchId: MATCH_ID, teamId: mockInnings.bowlingTeamId, designation: 'away' },
    ]);
    dbMocks.teamFindMany.mockResolvedValueOnce([
      { id: mockInnings.battingTeamId, name: 'Home XI' },
      { id: mockInnings.bowlingTeamId, name: 'Away XI' },
    ]);
    dbMocks.battingFindMany.mockResolvedValueOnce(mockBatting);
    dbMocks.bowlingFindMany.mockResolvedValueOnce(mockBowling);
    dbMocks.playerFindMany.mockResolvedValueOnce([
      { id: mockBatting[0].playerId, firstName: 'Alex', lastName: 'Batter' },
      { id: mockBowling[0].playerId, firstName: 'Bob', lastName: 'Bowler' },
    ]);

    const res = await app.inject({ method: 'GET', url: SCORECARD_URL });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      battingTeamName: 'Home XI',
      bowlingTeamName: 'Away XI',
      batting: [expect.objectContaining({ playerName: 'Alex Batter' })],
      bowling: [expect.objectContaining({ playerName: 'Bob Bowler' })],
      extras: expect.objectContaining({ total: mockInnings.totalExtras }),
      fallOfWickets: [],
    });
  });

  it('returns 404 for innings-specific scorecard when innings not found', async () => {
    dbMocks.inningsFindFirst.mockResolvedValueOnce(undefined);

    const res = await app.inject({ method: 'GET', url: INNINGS_SCORECARD_URL });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Innings not found' });
  });

  it('returns innings-specific batting and bowling scorecard', async () => {
    dbMocks.inningsFindFirst.mockResolvedValueOnce(mockInnings);
    dbMocks.battingFindMany.mockResolvedValueOnce(mockBatting);
    dbMocks.bowlingFindMany.mockResolvedValueOnce(mockBowling);
    dbMocks.playerFindMany.mockResolvedValueOnce([
      { id: mockBatting[0].playerId, firstName: 'Alex', lastName: 'Batter' },
      { id: mockBowling[0].playerId, firstName: 'Bob', lastName: 'Bowler' },
    ]);

    const res = await app.inject({ method: 'GET', url: INNINGS_SCORECARD_URL });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.innings.id).toBe(INNINGS_ID);
    expect(body.batting[0].playerName).toBe('Alex Batter');
    expect(body.bowling[0].playerName).toBe('Bob Bowler');
  });
});
