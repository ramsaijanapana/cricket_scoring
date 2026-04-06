import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { match, innings } from '../db/schema/index';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Venue Statistics routes.
 * Mounted under /api/v1/venues
 *
 * Aggregates data from existing match/innings tables grouped by venue.
 */
export const venueRoutes: FastifyPluginAsync = async (app) => {
  // GET /:venue/stats — aggregate venue statistics
  app.get<{ Params: { venue: string } }>('/:venue/stats', async (req, reply) => {
    const venueName = decodeURIComponent(req.params.venue);

    // Find all completed matches at this venue
    const matches = await db
      .select({
        id: match.id,
        tossWinnerTeamId: match.tossWinnerTeamId,
        tossDecision: match.tossDecision,
        winnerTeamId: match.winnerTeamId,
      })
      .from(match)
      .where(and(eq(match.venue, venueName), eq(match.status, 'completed')));

    if (matches.length === 0) {
      return reply.status(404).send({ error: 'No completed matches found at this venue' });
    }

    const matchIds = matches.map(m => m.id);

    // Get all innings for these matches
    const allInnings = await db
      .select({
        matchId: innings.matchId,
        inningsNumber: innings.inningsNumber,
        totalRuns: innings.totalRuns,
        totalWickets: innings.totalWickets,
        totalOvers: innings.totalOvers,
      })
      .from(innings)
      .where(sql`${innings.matchId} = ANY(${matchIds})`);

    // Group by match
    const inningsByMatch = new Map<string, typeof allInnings>();
    for (const inn of allInnings) {
      const existing = inningsByMatch.get(inn.matchId) || [];
      existing.push(inn);
      inningsByMatch.set(inn.matchId, existing);
    }

    // Compute stats
    const firstInningsScores: number[] = [];
    const secondInningsScores: number[] = [];
    let highestTotal = 0;
    let lowestTotal = Infinity;
    let tossBatFirstWins = 0;
    let tossBatFirstCount = 0;

    for (const m of matches) {
      const mInnings = inningsByMatch.get(m.id) || [];
      const first = mInnings.find(i => i.inningsNumber === 1);
      const second = mInnings.find(i => i.inningsNumber === 2);

      if (first) {
        firstInningsScores.push(first.totalRuns);
        highestTotal = Math.max(highestTotal, first.totalRuns);
        lowestTotal = Math.min(lowestTotal, first.totalRuns);
      }
      if (second) {
        secondInningsScores.push(second.totalRuns);
        highestTotal = Math.max(highestTotal, second.totalRuns);
        lowestTotal = Math.min(lowestTotal, second.totalRuns);
      }

      // Toss-bat-first analysis
      if (m.tossDecision === 'bat') {
        tossBatFirstCount++;
        // Find which team batted first (innings 1 batting team)
        // If toss winner chose to bat and won the match
        if (m.tossWinnerTeamId && m.winnerTeamId === m.tossWinnerTeamId) {
          tossBatFirstWins++;
        }
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    return {
      venue: venueName,
      matchesPlayed: matches.length,
      avgFirstInningsScore: avg(firstInningsScores),
      avgSecondInningsScore: avg(secondInningsScores),
      highestTotal: highestTotal === 0 ? null : highestTotal,
      lowestTotal: lowestTotal === Infinity ? null : lowestTotal,
      tossBatFirstWinPct: tossBatFirstCount > 0
        ? Math.round((tossBatFirstWins / tossBatFirstCount) * 100)
        : null,
    };
  });
};
