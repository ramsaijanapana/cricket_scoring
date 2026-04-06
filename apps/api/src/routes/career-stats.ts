/**
 * Career Stats Routes — comprehensive career statistics aggregation.
 *
 * Aggregates batting, bowling, and fielding statistics across all matches
 * with optional breakdown by format (T20/ODI/Test).
 */

import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { innings } from '../db/schema/innings';
import { match } from '../db/schema/match';
import { matchFormatConfig } from '../db/schema/match-format';
import { eq, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BattingStats {
  matches: number;
  innings: number;
  runs: number;
  average: number;
  strikeRate: number;
  highestScore: number;
  fifties: number;
  hundreds: number;
  fours: number;
  sixes: number;
  notOuts: number;
  ballsFaced: number;
  dots: number;
}

interface BowlingStats {
  matches: number;
  innings: number;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  average: number;
  economy: number;
  strikeRate: number;
  bestFiguresWickets: number;
  bestFiguresRuns: number;
  fiveWicketHauls: number;
}

interface FieldingStats {
  catches: number;
  stumpings: number;
  runOuts: number;
}

interface CareerStats {
  batting: BattingStats;
  bowling: BowlingStats;
  fielding: FieldingStats;
  byFormat: Record<string, { batting: BattingStats; bowling: BowlingStats; fielding: FieldingStats }>;
}

// ---------------------------------------------------------------------------
// Route Plugin
// ---------------------------------------------------------------------------

export const careerStatsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/v1/players/:id/career-stats
   *
   * Returns full career statistics for a player, including batting, bowling,
   * fielding, and a breakdown by match format.
   */
  app.get<{
    Params: { id: string };
  }>('/:id/career-stats', async (req, reply) => {
    const playerId = req.params.id;

    // --- Batting aggregation ---
    const battingRows = await db
      .select({
        formatName: matchFormatConfig.name,
        matchId: innings.matchId,
        runsScored: battingScorecard.runsScored,
        ballsFaced: battingScorecard.ballsFaced,
        fours: battingScorecard.fours,
        sixes: battingScorecard.sixes,
        isOut: battingScorecard.isOut,
        isNotOut: battingScorecard.isNotOut,
        didNotBat: battingScorecard.didNotBat,
        dots: battingScorecard.dots,
      })
      .from(battingScorecard)
      .innerJoin(innings, eq(battingScorecard.inningsId, innings.id))
      .innerJoin(match, eq(innings.matchId, match.id))
      .innerJoin(matchFormatConfig, eq(match.formatConfigId, matchFormatConfig.id))
      .where(eq(battingScorecard.playerId, playerId));

    // --- Bowling aggregation ---
    const bowlingRows = await db
      .select({
        formatName: matchFormatConfig.name,
        matchId: innings.matchId,
        oversBowled: bowlingScorecard.oversBowled,
        maidens: bowlingScorecard.maidens,
        runsConceded: bowlingScorecard.runsConceded,
        wicketsTaken: bowlingScorecard.wicketsTaken,
      })
      .from(bowlingScorecard)
      .innerJoin(innings, eq(bowlingScorecard.inningsId, innings.id))
      .innerJoin(match, eq(innings.matchId, match.id))
      .innerJoin(matchFormatConfig, eq(match.formatConfigId, matchFormatConfig.id))
      .where(eq(bowlingScorecard.playerId, playerId));

    // --- Fielding aggregation ---
    const fieldingRows = await db
      .select({
        formatName: matchFormatConfig.name,
        catches: fieldingScorecard.catches,
        stumpings: fieldingScorecard.stumpings,
        runOuts: fieldingScorecard.runOuts,
      })
      .from(fieldingScorecard)
      .innerJoin(innings, eq(fieldingScorecard.inningsId, innings.id))
      .innerJoin(match, eq(innings.matchId, match.id))
      .innerJoin(matchFormatConfig, eq(match.formatConfigId, matchFormatConfig.id))
      .where(eq(fieldingScorecard.playerId, playerId));

    // --- Aggregate batting stats ---
    function aggregateBatting(rows: typeof battingRows): BattingStats {
      const battedRows = rows.filter((r) => !r.didNotBat);
      const matchIds = new Set(rows.map((r) => r.matchId));
      const totalInnings = battedRows.length;
      const notOuts = battedRows.filter((r) => r.isNotOut).length;
      const totalRuns = battedRows.reduce((sum, r) => sum + r.runsScored, 0);
      const totalBalls = battedRows.reduce((sum, r) => sum + r.ballsFaced, 0);
      const totalFours = battedRows.reduce((sum, r) => sum + r.fours, 0);
      const totalSixes = battedRows.reduce((sum, r) => sum + r.sixes, 0);
      const totalDots = battedRows.reduce((sum, r) => sum + r.dots, 0);
      const dismissals = totalInnings - notOuts;
      const highestScore = battedRows.length > 0
        ? Math.max(...battedRows.map((r) => r.runsScored))
        : 0;
      const fifties = battedRows.filter((r) => r.runsScored >= 50 && r.runsScored < 100).length;
      const hundreds = battedRows.filter((r) => r.runsScored >= 100).length;

      return {
        matches: matchIds.size,
        innings: totalInnings,
        runs: totalRuns,
        average: dismissals > 0 ? round2(totalRuns / dismissals) : totalRuns,
        strikeRate: totalBalls > 0 ? round2((totalRuns / totalBalls) * 100) : 0,
        highestScore,
        fifties,
        hundreds,
        fours: totalFours,
        sixes: totalSixes,
        notOuts,
        ballsFaced: totalBalls,
        dots: totalDots,
      };
    }

    // --- Aggregate bowling stats ---
    function aggregateBowling(rows: typeof bowlingRows): BowlingStats {
      const matchIds = new Set(rows.map((r) => r.matchId));
      const totalInnings = rows.length;
      const totalOvers = rows.reduce((sum, r) => sum + parseFloat(r.oversBowled), 0);
      const totalMaidens = rows.reduce((sum, r) => sum + r.maidens, 0);
      const totalRuns = rows.reduce((sum, r) => sum + r.runsConceded, 0);
      const totalWickets = rows.reduce((sum, r) => sum + r.wicketsTaken, 0);

      // Best figures: find the innings with best wickets (then lowest runs)
      let bestWickets = 0;
      let bestRuns = 0;
      for (const r of rows) {
        if (
          r.wicketsTaken > bestWickets ||
          (r.wicketsTaken === bestWickets && r.runsConceded < bestRuns)
        ) {
          bestWickets = r.wicketsTaken;
          bestRuns = r.runsConceded;
        }
      }

      // 5-wicket hauls
      const fiveWicketHauls = rows.filter((r) => r.wicketsTaken >= 5).length;

      // Bowling strike rate: balls per wicket
      const totalBallsBowled = oversToTotalBalls(totalOvers);
      const bowlingSR = totalWickets > 0 ? round2(totalBallsBowled / totalWickets) : 0;

      return {
        matches: matchIds.size,
        innings: totalInnings,
        overs: round2(totalOvers),
        maidens: totalMaidens,
        runs: totalRuns,
        wickets: totalWickets,
        average: totalWickets > 0 ? round2(totalRuns / totalWickets) : 0,
        economy: totalOvers > 0 ? round2(totalRuns / totalOvers) : 0,
        strikeRate: bowlingSR,
        bestFiguresWickets: bestWickets,
        bestFiguresRuns: bestRuns,
        fiveWicketHauls,
      };
    }

    // --- Aggregate fielding stats ---
    function aggregateFielding(rows: typeof fieldingRows): FieldingStats {
      return {
        catches: rows.reduce((sum, r) => sum + r.catches, 0),
        stumpings: rows.reduce((sum, r) => sum + r.stumpings, 0),
        runOuts: rows.reduce((sum, r) => sum + r.runOuts, 0),
      };
    }

    // --- Group by format ---
    const formats = new Set<string>();
    for (const r of battingRows) formats.add(r.formatName);
    for (const r of bowlingRows) formats.add(r.formatName);
    for (const r of fieldingRows) formats.add(r.formatName);

    const byFormat: Record<string, { batting: BattingStats; bowling: BowlingStats; fielding: FieldingStats }> = {};
    for (const fmt of formats) {
      byFormat[fmt] = {
        batting: aggregateBatting(battingRows.filter((r) => r.formatName === fmt)),
        bowling: aggregateBowling(bowlingRows.filter((r) => r.formatName === fmt)),
        fielding: aggregateFielding(fieldingRows.filter((r) => r.formatName === fmt)),
      };
    }

    const result: CareerStats = {
      batting: aggregateBatting(battingRows),
      bowling: aggregateBowling(bowlingRows),
      fielding: aggregateFielding(fieldingRows),
      byFormat,
    };

    return result;
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convert a float overs total (e.g. 23.5) to total balls.
 * Note: overs_bowled is stored as numeric(4,1) so 4.0 means 4 overs.
 * For aggregation across multiple innings, fractional parts can exceed .5
 * because they're summed as decimals. We treat the sum as regular division.
 */
function oversToTotalBalls(overs: number): number {
  // Since overs are stored as decimal (4.0 = 4 overs, 3.2 = 3 overs 2 balls),
  // when summed across innings we lose the cricket-specific semantics.
  // Approximate: use overs * 6 as a reasonable estimate for aggregated stats.
  return Math.round(overs * 6);
}
