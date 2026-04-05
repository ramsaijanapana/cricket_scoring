import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { match, matchTeam, innings, matchFormatConfig, delivery } from '../db/schema/index';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { eq, and, desc, sql } from 'drizzle-orm';
import { broadcast } from '../services/realtime';

export const matchRoutes: FastifyPluginAsync = async (app) => {
  // List all matches
  app.get('/', async () => {
    return db.query.match.findMany({
      orderBy: (m, { desc }) => [desc(m.createdAt)],
    });
  });

  // Get match by ID with teams and innings
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!result) return reply.status(404).send({ error: 'Match not found' });

    const teams = await db.query.matchTeam.findMany({
      where: eq(matchTeam.matchId, req.params.id),
    });

    const matchInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    return { ...result, teams, innings: matchInnings };
  });

  // Create match
  app.post<{
    Body: {
      formatConfigId: string;
      tournamentId?: string;
      venue?: string;
      city?: string;
      country?: string;
      scheduledStart?: string;
      homeTeamId: string;
      awayTeamId: string;
      homePlayingXi: string[];
      awayPlayingXi: string[];
      tossWinnerTeamId?: string;
      tossDecision?: string;
    };
  }>('/', async (req, reply) => {
    const body = req.body;

    // Create match
    const [newMatch] = await db.insert(match).values({
      formatConfigId: body.formatConfigId,
      tournamentId: body.tournamentId,
      venue: body.venue,
      city: body.city,
      country: body.country,
      scheduledStart: body.scheduledStart ? new Date(body.scheduledStart) : null,
      tossWinnerTeamId: body.tossWinnerTeamId,
      tossDecision: body.tossDecision,
      status: body.tossWinnerTeamId ? 'toss' : 'scheduled',
    }).returning();

    // Create match teams
    await db.insert(matchTeam).values([
      {
        matchId: newMatch.id,
        teamId: body.homeTeamId,
        designation: 'home',
        playingXi: body.homePlayingXi,
      },
      {
        matchId: newMatch.id,
        teamId: body.awayTeamId,
        designation: 'away',
        playingXi: body.awayPlayingXi,
      },
    ]);

    return reply.status(201).send(newMatch);
  });

  // Start match (create first innings + initialize scorecards)
  app.post<{
    Params: { id: string };
    Body: {
      battingTeamId: string;
      bowlingTeamId: string;
      battingOrder: string[]; // player IDs in batting order
    };
  }>('/:id/start', async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    // Update match status to live
    await db.update(match).set({
      status: 'live',
      actualStart: new Date(),
    }).where(eq(match.id, req.params.id));

    // Create first innings
    const [newInnings] = await db.insert(innings).values({
      matchId: req.params.id,
      inningsNumber: 1,
      battingTeamId: req.body.battingTeamId,
      bowlingTeamId: req.body.bowlingTeamId,
      status: 'in_progress',
      startedAt: new Date(),
    }).returning();

    // Initialize batting scorecards for all players in batting order
    const battingScorecardEntries = req.body.battingOrder.map((playerId, idx) => ({
      inningsId: newInnings.id,
      playerId,
      teamId: req.body.battingTeamId,
      battingPosition: idx + 1,
      didNotBat: idx >= 2, // First two batsmen are at crease
    }));
    await db.insert(battingScorecard).values(battingScorecardEntries);

    // Get bowling team's playing XI for fielding scorecards
    const bowlingTeamMatch = await db.query.matchTeam.findFirst({
      where: eq(matchTeam.teamId, req.body.bowlingTeamId),
    });

    if (bowlingTeamMatch?.playingXi) {
      const fieldingScorecardEntries = bowlingTeamMatch.playingXi
        .filter((id): id is string => id !== null)
        .map(playerId => ({
          inningsId: newInnings.id,
          playerId,
          teamId: req.body.bowlingTeamId,
        }));
      await db.insert(fieldingScorecard).values(fieldingScorecardEntries);
    }

    return reply.status(201).send(newInnings);
  });

  // Update match (patch)
  app.patch<{
    Params: { id: string };
    Body: Partial<{
      status: string;
      resultSummary: string;
      winnerTeamId: string;
      winMarginRuns: number;
      winMarginWickets: number;
    }>;
  }>('/:id', async (req, reply) => {
    const [updated] = await db.update(match).set({
      ...req.body,
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Match not found' });
    return updated;
  });

  // Record toss — context.md section 6.1
  app.post<{
    Params: { id: string };
    Body: { winner_id: string; decision: 'bat' | 'field' };
  }>('/:id/toss', async (req, reply) => {
    const [updated] = await db.update(match).set({
      tossWinnerTeamId: req.body.winner_id,
      tossDecision: req.body.decision,
      status: 'toss',
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Match not found' });
    return updated;
  });

  // Record interruption (rain/bad-light) — context.md section 6.1
  app.post<{
    Params: { id: string };
    Body: { reason: string; timestamp?: string };
  }>('/:id/interruption', async (req, reply) => {
    const [updated] = await db.update(match).set({
      status: 'rain_delay',
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Match not found' });

    broadcast.status(req.params.id, {
      status: 'rain_delay',
      reason: req.body.reason,
    });

    return updated;
  });

  // Resume match after interruption — context.md section 6.1
  app.post<{
    Params: { id: string };
    Body: { timestamp?: string; revised_overs?: number };
  }>('/:id/resume', async (req, reply) => {
    const [updated] = await db.update(match).set({
      status: 'live',
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Match not found' });

    broadcast.status(req.params.id, {
      status: 'resumed',
      reason: 'Match resumed',
    });

    return updated;
  });

  // Initiate super over — context.md section 6.1
  app.post<{
    Params: { id: string };
    Body: {
      battingTeamId: string;
      bowlingTeamId: string;
      battingOrder: string[];
    };
  }>('/:id/super-over', async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    // Create super over innings
    const existingInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
    });

    const [superOverInnings] = await db.insert(innings).values({
      matchId: req.params.id,
      inningsNumber: existingInnings.length + 1,
      battingTeamId: req.body.battingTeamId,
      bowlingTeamId: req.body.bowlingTeamId,
      isSuperOver: true,
      status: 'in_progress',
      startedAt: new Date(),
    }).returning();

    // Initialize batting scorecards
    const entries = req.body.battingOrder.map((playerId, idx) => ({
      inningsId: superOverInnings.id,
      playerId,
      teamId: req.body.battingTeamId,
      battingPosition: idx + 1,
      didNotBat: idx >= 2,
    }));
    await db.insert(battingScorecard).values(entries);

    await db.update(match).set({
      status: 'super_over' as any,
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id));

    broadcast.status(req.params.id, {
      status: 'super_over',
      reason: 'Super over initiated',
    });

    return reply.status(201).send(superOverInnings);
  });

  // Partial match state — context.md section 6.1
  app.get<{
    Params: { id: string };
    Querystring: { fields?: string };
  }>('/:id/state', async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    const fields = req.query.fields?.split(',') || ['scorecard', 'innings', 'current_over'];
    const result: Record<string, any> = { matchId: req.params.id, status: matchData.status };

    if (fields.includes('innings')) {
      result.innings = await db.query.innings.findMany({
        where: eq(innings.matchId, req.params.id),
        orderBy: (i, { asc }) => [asc(i.inningsNumber)],
      });
    }

    if (fields.includes('scorecard')) {
      const matchInnings = await db.query.innings.findMany({
        where: eq(innings.matchId, req.params.id),
      });
      result.scorecard = [];
      for (const inn of matchInnings) {
        const batting = await db.query.battingScorecard.findMany({
          where: eq(battingScorecard.inningsId, inn.id),
        });
        const bowling = await db.query.bowlingScorecard.findMany({
          where: eq(bowlingScorecard.inningsId, inn.id),
        });
        result.scorecard.push({ inningsId: inn.id, inningsNumber: inn.inningsNumber, batting, bowling });
      }
    }

    if (fields.includes('current_over')) {
      const liveInnings = await db.query.innings.findFirst({
        where: and(eq(innings.matchId, req.params.id), eq(innings.status, 'in_progress')),
      });
      if (liveInnings) {
        const recentDeliveries = await db.query.delivery.findMany({
          where: and(eq(delivery.inningsId, liveInnings.id), eq(delivery.isOverridden, false)),
          orderBy: [desc(delivery.undoStackPos)],
          limit: 6,
        });
        result.current_over = recentDeliveries.reverse();
      }
    }

    return result;
  });
};
