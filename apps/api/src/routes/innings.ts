import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { innings, match, matchTeam, matchFormatConfig } from '../db/schema/index';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { eq } from 'drizzle-orm';

export const inningsRoutes: FastifyPluginAsync = async (app) => {
  // Create new innings (for 2nd innings, super over, etc.)
  app.post<{
    Params: { id: string }; // match ID
    Body: {
      battingTeamId: string;
      bowlingTeamId: string;
      battingOrder: string[];
      isSuperOver?: boolean;
      targetScore?: number;
    };
  }>('/:id/innings', async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    // Get next innings number
    const existingInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
    });
    const nextNumber = existingInnings.length + 1;

    const [newInnings] = await db.insert(innings).values({
      matchId: req.params.id,
      inningsNumber: nextNumber,
      battingTeamId: req.body.battingTeamId,
      bowlingTeamId: req.body.bowlingTeamId,
      isSuperOver: req.body.isSuperOver ?? false,
      targetScore: req.body.targetScore ?? null,
      status: 'in_progress',
      startedAt: new Date(),
    }).returning();

    // Initialize batting scorecards
    const entries = req.body.battingOrder.map((playerId, idx) => ({
      inningsId: newInnings.id,
      playerId,
      teamId: req.body.battingTeamId,
      battingPosition: idx + 1,
      didNotBat: idx >= 2,
    }));
    await db.insert(battingScorecard).values(entries);

    // Initialize fielding scorecards for bowling team
    const bowlingTeamMatch = await db.query.matchTeam.findFirst({
      where: eq(matchTeam.teamId, req.body.bowlingTeamId),
    });
    if (bowlingTeamMatch?.playingXi) {
      const fieldingEntries = bowlingTeamMatch.playingXi
        .filter((id): id is string => id !== null)
        .map(playerId => ({
          inningsId: newInnings.id,
          playerId,
          teamId: req.body.bowlingTeamId,
        }));
      await db.insert(fieldingScorecard).values(fieldingEntries);
    }

    return reply.status(201).send(newInnings);
  });

  // Declare innings
  app.post<{ Params: { id: string; inningsId: string } }>(
    '/:id/innings/:inningsId/declare',
    async (req, reply) => {
      const [updated] = await db.update(innings).set({
        declared: true,
        status: 'completed',
        endedAt: new Date(),
      }).where(eq(innings.id, req.params.inningsId)).returning();

      if (!updated) return reply.status(404).send({ error: 'Innings not found' });
      return updated;
    },
  );

  // Set new bowler (create bowling scorecard entry)
  app.post<{
    Params: { id: string; inningsId: string };
    Body: { bowlerId: string };
  }>('/:id/innings/:inningsId/bowler', async (req, reply) => {
    const existing = await db.query.bowlingScorecard.findFirst({
      where: (bs, { and, eq: e }) => and(
        e(bs.inningsId, req.params.inningsId),
        e(bs.playerId, req.body.bowlerId),
      ),
    });

    if (!existing) {
      // Count existing bowlers for position
      const allBowlers = await db.query.bowlingScorecard.findMany({
        where: eq(bowlingScorecard.inningsId, req.params.inningsId),
      });

      const [entry] = await db.insert(bowlingScorecard).values({
        inningsId: req.params.inningsId,
        playerId: req.body.bowlerId,
        teamId: (await db.query.innings.findFirst({
          where: eq(innings.id, req.params.inningsId),
        }))!.bowlingTeamId,
        bowlingPosition: allBowlers.length + 1,
      }).returning();
      return reply.status(201).send(entry);
    }

    return existing;
  });

  // Mark batsman as coming to crease (update didNotBat)
  app.post<{
    Params: { id: string; inningsId: string };
    Body: { playerId: string };
  }>('/:id/innings/:inningsId/new-batsman', async (req, reply) => {
    const [updated] = await db.update(battingScorecard).set({
      didNotBat: false,
    }).where(
      eq(battingScorecard.inningsId, req.params.inningsId),
    ).returning();

    return { success: true };
  });

  // Enforce follow-on — context.md section 5.10
  app.post<{
    Params: { id: string; inningsId: string };
  }>('/:id/innings/:inningsId/follow-on', async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    const formatConfig = await db.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, matchData.formatConfigId),
    });
    if (!formatConfig?.hasFollowOn) {
      return reply.status(422).send({
        error: { code: 'FORMAT_RULE_VIOLATION', message: 'Follow-on is not allowed in this format' },
      });
    }

    // Get completed innings to check deficit
    const allInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    if (allInnings.length < 2) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Need at least 2 completed innings to enforce follow-on' },
      });
    }

    const firstInnings = allInnings[0];
    const secondInnings = allInnings[1];
    const deficit = firstInnings.totalRuns - secondInnings.totalRuns;

    // Follow-on threshold: 200 for 5-day, 150 for 3/4-day, 100 for 2-day, 75 for 1-day
    const threshold = 200; // default Test threshold
    if (deficit < threshold) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: `Deficit (${deficit}) is less than follow-on threshold (${threshold})` },
      });
    }

    // Mark the follow-on innings
    await db.update(innings).set({ followOn: true }).where(eq(innings.id, req.params.inningsId));

    return { success: true, deficit, threshold };
  });
};
