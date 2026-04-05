import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { innings } from '../db/schema/index';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { eq } from 'drizzle-orm';

export const scorecardRoutes: FastifyPluginAsync = async (app) => {
  // Get full scorecard for a match
  app.get<{ Params: { id: string } }>('/:id/scorecard', async (req, reply) => {
    const matchInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    const scorecard = await Promise.all(
      matchInnings.map(async (inn) => {
        const batting = await db.query.battingScorecard.findMany({
          where: eq(battingScorecard.inningsId, inn.id),
          orderBy: (bs, { asc }) => [asc(bs.battingPosition)],
        });

        const bowling = await db.query.bowlingScorecard.findMany({
          where: eq(bowlingScorecard.inningsId, inn.id),
          orderBy: (bs, { asc }) => [asc(bs.bowlingPosition)],
        });

        const fielding = await db.query.fieldingScorecard.findMany({
          where: eq(fieldingScorecard.inningsId, inn.id),
        });

        // Compute extras breakdown from innings
        const extras = {
          total: inn.totalExtras,
        };

        // Compute fall of wickets from batting scorecard
        const fallOfWickets = batting
          .filter(b => b.isOut)
          .map(b => ({
            playerId: b.playerId,
            dismissalText: b.dismissalText,
            battingPosition: b.battingPosition,
          }));

        return {
          innings: inn,
          batting,
          bowling,
          fielding,
          extras,
          fallOfWickets,
        };
      }),
    );

    return scorecard;
  });

  // Get scorecard for a specific innings
  app.get<{ Params: { id: string; inningsId: string } }>(
    '/:id/innings/:inningsId/scorecard',
    async (req, reply) => {
      const inn = await db.query.innings.findFirst({
        where: eq(innings.id, req.params.inningsId),
      });
      if (!inn) return reply.status(404).send({ error: 'Innings not found' });

      const batting = await db.query.battingScorecard.findMany({
        where: eq(battingScorecard.inningsId, req.params.inningsId),
        orderBy: (bs, { asc }) => [asc(bs.battingPosition)],
      });

      const bowling = await db.query.bowlingScorecard.findMany({
        where: eq(bowlingScorecard.inningsId, req.params.inningsId),
        orderBy: (bs, { asc }) => [asc(bs.bowlingPosition)],
      });

      return { innings: inn, batting, bowling };
    },
  );
};
