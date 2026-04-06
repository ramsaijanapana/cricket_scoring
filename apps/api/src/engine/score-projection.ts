/**
 * Score Projection Engine — time-series based score projection.
 *
 * Calculates low/mid/high projected totals based on current run rate,
 * recent acceleration trends, and wickets in hand.
 */

import { db } from '../db/index';
import { delivery } from '../db/schema/index';
import { innings } from '../db/schema/innings';
import { matchFormatConfig, match } from '../db/schema/index';
import { eq, and, asc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreProjection {
  low: number;
  mid: number;
  high: number;
  currentRunRate: number;
  projectedRunRate: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse an overs string like "12.4" into total balls bowled.
 */
function oversToBalls(overs: string | number): number {
  const o = typeof overs === 'string' ? parseFloat(overs) : overs;
  const whole = Math.floor(o);
  const balls = Math.round((o - whole) * 10);
  return whole * 6 + balls;
}

/**
 * Calculate run rate per over from runs and total balls.
 */
function runRate(runs: number, balls: number): number {
  if (balls <= 0) return 0;
  return (runs / balls) * 6;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Project the final score for the given innings.
 *
 * Uses:
 * - Current run rate
 * - Acceleration/deceleration trend from last 5 overs vs previous 5 overs
 * - Wickets in hand (more wickets remaining = wider optimistic range)
 * - Overs remaining
 *
 * Returns low (pessimistic), mid (current trend continues), high (optimistic).
 */
export async function projectScore(
  matchId: string,
  inningsId: string,
): Promise<ScoreProjection> {
  // Fetch innings state
  const [inningsRow] = await db
    .select()
    .from(innings)
    .where(eq(innings.id, inningsId))
    .limit(1);

  if (!inningsRow) {
    return { low: 0, mid: 0, high: 0, currentRunRate: 0, projectedRunRate: 0 };
  }

  // Fetch format config for total overs
  const [matchRow] = await db
    .select({ formatConfigId: match.formatConfigId })
    .from(match)
    .where(eq(match.id, matchId))
    .limit(1);

  if (!matchRow) {
    return { low: 0, mid: 0, high: 0, currentRunRate: 0, projectedRunRate: 0 };
  }

  const [formatConfig] = await db
    .select()
    .from(matchFormatConfig)
    .where(eq(matchFormatConfig.id, matchRow.formatConfigId))
    .limit(1);

  const totalOversAllowed = formatConfig?.oversPerInnings ?? 50;

  // Fetch all non-overridden deliveries for this innings, ordered by undo_stack_pos
  const deliveries = await db
    .select()
    .from(delivery)
    .where(
      and(
        eq(delivery.inningsId, inningsId),
        eq(delivery.isOverridden, false),
      ),
    )
    .orderBy(asc(delivery.undoStackPos));

  if (deliveries.length === 0) {
    return { low: 0, mid: 0, high: 0, currentRunRate: 0, projectedRunRate: 0 };
  }

  const currentScore = inningsRow.totalRuns;
  const currentWickets = inningsRow.totalWickets;
  const ballsBowled = oversToBalls(inningsRow.totalOvers);
  const totalBalls = totalOversAllowed * 6;
  const ballsRemaining = Math.max(0, totalBalls - ballsBowled);

  if (ballsRemaining === 0 || ballsBowled === 0) {
    return {
      low: currentScore,
      mid: currentScore,
      high: currentScore,
      currentRunRate: runRate(currentScore, ballsBowled),
      projectedRunRate: runRate(currentScore, ballsBowled),
    };
  }

  const currentRR = runRate(currentScore, ballsBowled);

  // --- Trend analysis: compare last 5 overs vs previous 5 overs ---
  const currentOverNum = deliveries[deliveries.length - 1].overNum;

  // Group deliveries by over and sum runs
  const overRunsMap = new Map<number, number>();
  for (const d of deliveries) {
    overRunsMap.set(d.overNum, (overRunsMap.get(d.overNum) ?? 0) + d.totalRuns);
  }

  const overNumbers = Array.from(overRunsMap.keys()).sort((a, b) => a - b);

  // Last 5 completed overs
  const recentOvers = overNumbers.slice(-5);
  const previousOvers = overNumbers.slice(-10, -5);

  const recentRR =
    recentOvers.length > 0
      ? recentOvers.reduce((sum, o) => sum + (overRunsMap.get(o) ?? 0), 0) / recentOvers.length
      : currentRR;

  const previousRR =
    previousOvers.length > 0
      ? previousOvers.reduce((sum, o) => sum + (overRunsMap.get(o) ?? 0), 0) / previousOvers.length
      : recentRR;

  // Acceleration factor: how much RR is changing
  const accelerationFactor = previousRR > 0 ? recentRR / previousRR : 1;

  // Projected run rate uses current trend
  const projectedRR = recentRR * accelerationFactor;

  // --- Wickets-in-hand adjustment ---
  const wicketsInHand = Math.max(0, 10 - currentWickets);
  // More wickets in hand = wider range between low and high
  // Scale: 0 wickets = 0% range expansion, 10 wickets = 100% range expansion
  const wicketFactor = wicketsInHand / 10;

  // --- Calculate projections ---
  const oversRemaining = ballsRemaining / 6;

  // Mid projection: current run rate continues
  const midAdditional = currentRR * oversRemaining;
  const mid = Math.round(currentScore + midAdditional);

  // Low projection: RR drops 20%
  const lowRR = currentRR * 0.8;
  const lowAdditional = lowRR * oversRemaining;
  const low = Math.round(currentScore + lowAdditional);

  // High projection: RR increases 20%, further amplified by wickets in hand
  const highRR = currentRR * (1.2 + 0.1 * wicketFactor);
  const highAdditional = highRR * oversRemaining;
  const high = Math.round(currentScore + highAdditional);

  return {
    low: Math.max(currentScore, low),
    mid: Math.max(currentScore, mid),
    high: Math.max(currentScore, high),
    currentRunRate: roundTo2(currentRR),
    projectedRunRate: roundTo2(projectedRR),
  };
}
