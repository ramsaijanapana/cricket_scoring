import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { player, playerTeamMembership, battingScorecard, innings } from '../db/schema/index';
import { eq, and, desc, sql } from 'drizzle-orm';
import { parsePagination, paginatedResponse } from '../middleware/pagination';
import { requireAuth } from '../middleware/auth';

export const playerRoutes: FastifyPluginAsync = async (app) => {
  // List all players
  app.get('/', async (req) => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const players = await db.query.player.findMany({
      orderBy: (p, { asc }) => [asc(p.lastName), asc(p.firstName)],
      limit,
      offset,
    });
    return paginatedResponse(players, page, limit);
  });

  // Get player by ID
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await db.query.player.findFirst({
      where: eq(player.id, req.params.id),
    });
    if (!result) return reply.status(404).send({ error: 'Player not found' });
    return result;
  });

  // Create player
  app.post<{
    Body: {
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      battingStyle?: string;
      bowlingStyle?: string;
      primaryRole?: string;
    };
  }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const [newPlayer] = await db.insert(player).values({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      dateOfBirth: req.body.dateOfBirth,
      battingStyle: req.body.battingStyle,
      bowlingStyle: req.body.bowlingStyle,
      primaryRole: req.body.primaryRole,
    }).returning();
    return reply.status(201).send(newPlayer);
  });

  // Update player
  app.patch<{
    Params: { id: string };
    Body: Partial<{
      firstName: string;
      lastName: string;
      battingStyle: string;
      bowlingStyle: string;
      primaryRole: string;
    }>;
  }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const [updated] = await db.update(player).set({
      ...req.body,
      updatedAt: new Date(),
    }).where(eq(player.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Player not found' });
    return updated;
  });

  // Assign player to team
  app.post<{
    Params: { id: string };
    Body: { teamId: string; jerseyNumber?: number; roleInTeam?: string; joinedAt: string };
  }>('/:id/teams', { preHandler: [requireAuth] }, async (req, reply) => {
    const [membership] = await db.insert(playerTeamMembership).values({
      playerId: req.params.id,
      teamId: req.body.teamId,
      jerseyNumber: req.body.jerseyNumber,
      roleInTeam: req.body.roleInTeam,
      joinedAt: req.body.joinedAt,
    }).returning();
    return reply.status(201).send(membership);
  });

  // GET /:id/form — Player form tracking (last 5 innings)
  app.get<{ Params: { id: string } }>('/:id/form', async (req, reply) => {
    const result = await db.query.player.findFirst({
      where: eq(player.id, req.params.id),
    });
    if (!result) return reply.status(404).send({ error: 'Player not found' });

    // Get last 5 batting innings (non-DNB), ordered by most recent
    const recentInnings = await db
      .select({
        runsScored: battingScorecard.runsScored,
        ballsFaced: battingScorecard.ballsFaced,
        isOut: battingScorecard.isOut,
        didNotBat: battingScorecard.didNotBat,
        strikeRate: battingScorecard.strikeRate,
        inningsId: battingScorecard.inningsId,
      })
      .from(battingScorecard)
      .innerJoin(innings, eq(battingScorecard.inningsId, innings.id))
      .where(
        and(
          eq(battingScorecard.playerId, req.params.id),
          eq(battingScorecard.didNotBat, false),
        ),
      )
      .orderBy(desc(innings.startedAt))
      .limit(5);

    if (recentInnings.length === 0) {
      return {
        playerId: req.params.id,
        innings: 0,
        average: 0,
        strikeRate: 0,
        trend: 'stable' as const,
        dataPoints: [],
      };
    }

    // Calculate averages
    const totalRuns = recentInnings.reduce((s, i) => s + i.runsScored, 0);
    const outs = recentInnings.filter(i => i.isOut).length;
    const totalBalls = recentInnings.reduce((s, i) => s + i.ballsFaced, 0);
    const average = outs > 0 ? totalRuns / outs : totalRuns;
    const sr = totalBalls > 0 ? (totalRuns / totalBalls) * 100 : 0;

    // Trend: compare first half vs second half of recent innings
    const dataPoints = recentInnings.map(i => i.runsScored).reverse(); // oldest first
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (dataPoints.length >= 3) {
      const mid = Math.floor(dataPoints.length / 2);
      const firstHalfAvg = dataPoints.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondHalfAvg = dataPoints.slice(mid).reduce((a, b) => a + b, 0) / (dataPoints.length - mid);
      if (secondHalfAvg > firstHalfAvg * 1.15) trend = 'up';
      else if (secondHalfAvg < firstHalfAvg * 0.85) trend = 'down';
    }

    return {
      playerId: req.params.id,
      innings: recentInnings.length,
      average: Math.round(average * 100) / 100,
      strikeRate: Math.round(sr * 100) / 100,
      trend,
      dataPoints,
    };
  });
};
