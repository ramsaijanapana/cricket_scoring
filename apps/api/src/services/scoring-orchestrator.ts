import { db } from '../db/index';
import { delivery, partnership, player, matchFormatConfig } from '../db/schema/index';
import { match, matchTeam } from '../db/schema/match';
import { teamFollow } from '../db/schema/follow';
import { team } from '../db/schema/team';
import { battingScorecard, bowlingScorecard } from '../db/schema/scorecard';
import { broadcast } from './realtime';
import { sendNotification } from './notification-service';
import { cacheSet, cacheInvalidate } from './cache';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { MilestoneEvent } from '@cricket/shared';
import type { ScoringResult } from '../engine/scoring-engine';

// ─── Milestone Detection ────────────────────────────────────────────────────

const BATSMAN_THRESHOLDS = [
  { runs: 200, type: 'double_hundred' as const, label: 'Double Century' },
  { runs: 150, type: 'one_fifty' as const, label: '150 Runs' },
  { runs: 100, type: 'hundred' as const, label: 'Century' },
  { runs: 50, type: 'fifty' as const, label: 'Half Century' },
];

const TEAM_THRESHOLDS = [
  { runs: 300, type: 'team_three_hundred' as const, label: '300 Runs' },
  { runs: 200, type: 'team_two_hundred' as const, label: '200 Runs' },
  { runs: 100, type: 'team_hundred' as const, label: '100 Runs' },
];

async function getPlayerName(playerId: string): Promise<string> {
  const p = await db.query.player.findFirst({ where: eq(player.id, playerId) });
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown';
}

/**
 * Detect milestones after a delivery is recorded and broadcast them.
 * Checks batsman runs, bowler wickets (5-fer & hat-trick), and team score.
 */
async function detectAndBroadcastMilestones(
  matchId: string,
  deliveryRecord: typeof delivery.$inferSelect,
  postInningsScore: number,
  preInningsScore: number,
): Promise<void> {
  const milestones: MilestoneEvent[] = [];
  const del = deliveryRecord;

  if (del.runsBatsman > 0) {
    const batCard = await db.query.battingScorecard.findFirst({
      where: and(
        eq(battingScorecard.inningsId, del.inningsId),
        eq(battingScorecard.playerId, del.strikerId),
      ),
    });
    if (batCard) {
      const postRuns = batCard.runsScored;
      const preRuns = postRuns - del.runsBatsman;
      for (const threshold of BATSMAN_THRESHOLDS) {
        if (preRuns < threshold.runs && postRuns >= threshold.runs) {
          const name = await getPlayerName(del.strikerId);
          milestones.push({
            type: threshold.type,
            player: { id: del.strikerId, name },
            text: `${name} reaches ${threshold.label}! (${postRuns} runs off ${batCard.ballsFaced} balls)`,
          });
          break;
        }
      }
    }
  }

  if (del.isWicket) {
    const bowlCard = await db.query.bowlingScorecard.findFirst({
      where: and(
        eq(bowlingScorecard.inningsId, del.inningsId),
        eq(bowlingScorecard.playerId, del.bowlerId),
      ),
    });

    if (bowlCard && bowlCard.wicketsTaken === 5) {
      const name = await getPlayerName(del.bowlerId);
      milestones.push({
        type: 'five_wickets',
        player: { id: del.bowlerId, name },
        text: `${name} takes a 5-wicket haul! (5/${bowlCard.runsConceded})`,
      });
    }

    const recentBowlerDeliveries = await db.query.delivery.findMany({
      where: and(
        eq(delivery.inningsId, del.inningsId),
        eq(delivery.bowlerId, del.bowlerId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
      limit: 3,
    });

    if (
      recentBowlerDeliveries.length === 3 &&
      recentBowlerDeliveries.every((d) => d.isWicket)
    ) {
      const name = await getPlayerName(del.bowlerId);
      milestones.push({
        type: 'hat_trick',
        player: { id: del.bowlerId, name },
        text: `HAT-TRICK! ${name} takes 3 wickets in 3 consecutive deliveries!`,
      });
    }
  }

  for (const threshold of TEAM_THRESHOLDS) {
    if (preInningsScore < threshold.runs && postInningsScore >= threshold.runs) {
      milestones.push({
        type: threshold.type,
        player: { id: '', name: 'Team' },
        text: `Team reaches ${threshold.label}!`,
      });
      break;
    }
  }

  for (const milestone of milestones) {
    broadcast.milestone(matchId, milestone);
  }
}

/**
 * Queue push notifications for scoring events to followers of the teams in this match.
 */
async function queueScoringNotifications(
  matchId: string,
  deliveryRecord: typeof delivery.$inferSelect,
  postInningsScore: number,
  preInningsScore: number,
  matchCompleted: boolean,
): Promise<void> {
  const del = deliveryRecord;

  const matchRecord = await db.query.match.findFirst({ where: eq(match.id, matchId) });
  if (!matchRecord) return;

  const matchTeams = await db
    .select({ teamId: matchTeam.teamId, teamName: team.name })
    .from(matchTeam)
    .innerJoin(team, eq(matchTeam.teamId, team.id))
    .where(eq(matchTeam.matchId, matchId));
  const teamNames = matchTeams.map((t) => t.teamName).join(' vs ');

  const teamIds = matchTeams.map((t) => t.teamId);
  if (teamIds.length === 0) return;

  const followers = await db
    .select({ userId: teamFollow.userId })
    .from(teamFollow)
    .where(
      teamIds.length === 1
        ? eq(teamFollow.teamId, teamIds[0])
        : sql`${teamFollow.teamId} IN (${sql.join(teamIds.map((id) => sql`${id}`), sql`, `)})`,
    );

  if (followers.length === 0) return;

  const followerIds = [...new Set(followers.map((f) => f.userId))];

  if (del.isWicket) {
    const dismissedName = del.dismissedId ? await getPlayerName(del.dismissedId) : 'batsman';
    const bowlerName = await getPlayerName(del.bowlerId);
    for (const fId of followerIds) {
      sendNotification(
        fId,
        'wicket',
        `Wicket! ${dismissedName} out`,
        `${bowlerName} gets ${dismissedName}. ${teamNames} — ${postInningsScore}/${del.inningsWickets}`,
        { matchId, type: 'wicket' },
      );
    }
  }

  if (del.runsBatsman > 0) {
    const batCard = await db.query.battingScorecard.findFirst({
      where: and(
        eq(battingScorecard.inningsId, del.inningsId),
        eq(battingScorecard.playerId, del.strikerId),
      ),
    });
    if (batCard) {
      const postRuns = batCard.runsScored;
      const preRuns = postRuns - del.runsBatsman;
      for (const threshold of BATSMAN_THRESHOLDS) {
        if (preRuns < threshold.runs && postRuns >= threshold.runs) {
          const name = await getPlayerName(del.strikerId);
          for (const fId of followerIds) {
            sendNotification(
              fId,
              'milestone',
              `${threshold.label}! ${name}`,
              `${name} reaches ${threshold.label} (${postRuns} runs) — ${teamNames}`,
              { matchId, type: 'milestone', milestoneType: threshold.type },
            );
          }
          break;
        }
      }
    }
  }

  if (matchCompleted) {
    for (const fId of followerIds) {
      sendNotification(
        fId,
        'match_complete',
        'Match Completed',
        `${teamNames} — match has ended. ${matchRecord.resultSummary || 'Check scorecard for results.'}`,
        { matchId, type: 'match_complete' },
      );
    }
  }
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

async function broadcastWinPrediction(
  matchId: string,
  result: ScoringResult,
  targetScore: number,
  preDeliveryTotalWickets: number,
): Promise<void> {
  const currentScore = result.scorecardSnapshot.innings_score ?? 0;
  const oversStr = String(result.scorecardSnapshot.innings_overs ?? '0.0');
  const oversParts = oversStr.split('.');
  const completedOvers = parseInt(oversParts[0], 10) || 0;
  const partialBalls = parseInt(oversParts[1] || '0', 10);
  const totalBallsBowled = completedOvers * 6 + partialBalls;

  const matchRecord = await db.query.match.findFirst({ where: eq(match.id, matchId) });
  const formatConfig = matchRecord?.formatConfigId
    ? await db.query.matchFormatConfig.findFirst({ where: eq(matchFormatConfig.id, matchRecord.formatConfigId) })
    : null;
  const totalOvers = formatConfig?.oversPerInnings ?? 20;
  const totalBallsInInnings = totalOvers * 6;
  const remainingBalls = Math.max(totalBallsInInnings - totalBallsBowled, 1);

  const currentRunRate = totalBallsBowled > 0 ? (currentScore / totalBallsBowled) * 6 : 0;
  const requiredRunRate = ((targetScore - currentScore) / remainingBalls) * 6;

  let winProbChasing: number;
  if (currentScore >= targetScore) {
    winProbChasing = 100;
  } else if (remainingBalls <= 0 || preDeliveryTotalWickets >= 10) {
    winProbChasing = 0;
  } else if (requiredRunRate <= currentRunRate * 0.7) {
    winProbChasing = 80 + Math.min(15, (currentRunRate - requiredRunRate) * 3);
  } else if (requiredRunRate <= currentRunRate) {
    winProbChasing = 60 + (currentRunRate - requiredRunRate) * 10;
  } else if (requiredRunRate <= currentRunRate * 1.5) {
    winProbChasing = 40 + (1.5 - requiredRunRate / currentRunRate) * 40;
  } else if (requiredRunRate <= currentRunRate * 2) {
    winProbChasing = 20 + (2 - requiredRunRate / currentRunRate) * 40;
  } else {
    winProbChasing = Math.max(2, 20 - (requiredRunRate - currentRunRate * 2) * 5);
  }
  winProbChasing = Math.max(0, Math.min(100, Math.round(winProbChasing)));

  const projectedLow = Math.round(currentScore + (remainingBalls / 6) * currentRunRate * 0.85);
  const projectedHigh = Math.round(currentScore + (remainingBalls / 6) * currentRunRate * 1.15);

  broadcast.prediction(matchId, {
    winProbA: 100 - winProbChasing,
    winProbB: winProbChasing,
    projectedScoreLow: projectedLow,
    projectedScoreHigh: projectedHigh,
  });
}

async function broadcastDeliveryUpdate(matchId: string, result: ScoringResult): Promise<void> {
  if (result.delivery.isWicket) {
    const endedPartnership = await db.query.partnership.findFirst({
      where: and(
        eq(partnership.inningsId, result.delivery.inningsId),
        eq(partnership.isActive, false),
      ),
      orderBy: [desc(partnership.createdAt)],
    });

    broadcast.wicket(matchId, {
      delivery: result.delivery as any,
      wicketDetail: {
        wicketType: result.delivery.wicketType as any,
        dismissedId: result.delivery.dismissedId!,
        bowlerId: result.delivery.bowlerId,
        fielderIds: (result.delivery.fielderIds || []) as string[],
        text: `${result.delivery.wicketType}`,
      },
      commentary: result.commentary,
      partnershipEnded: endedPartnership as any,
    });
  } else {
    broadcast.delivery(matchId, {
      delivery: result.delivery as any,
      scorecardSnapshot: result.scorecardSnapshot as any,
      commentary: result.commentary,
    });
  }

  if (result.overCompleted) {
    const bowlerCard = await db.query.bowlingScorecard.findFirst({
      where: and(
        eq(bowlingScorecard.inningsId, result.delivery.inningsId),
        eq(bowlingScorecard.playerId, result.delivery.bowlerId),
      ),
    });

    broadcast.over(matchId, {
      overSummary: {
        overNum: result.delivery.overNum,
        runs: result.delivery.totalRuns,
        wickets: result.delivery.isWicket ? 1 : 0,
        maidens: result.delivery.totalRuns === 0,
        extras: result.delivery.runsExtras,
      },
      bowlerStats: {
        bowlerId: result.delivery.bowlerId,
        overs: bowlerCard ? parseFloat(bowlerCard.oversBowled) : 0,
        runs: bowlerCard?.runsConceded ?? 0,
        wickets: bowlerCard?.wicketsTaken ?? 0,
        economy: bowlerCard?.economyRate ? parseFloat(bowlerCard.economyRate) : 0,
      },
      runRate: result.scorecardSnapshot.run_rate,
    });
  }
}

export interface DeliveryRecordedContext {
  inningsNum: number;
  preInningsScore: number;
  targetScore: number | null;
  preDeliveryTotalWickets: number;
}

/**
 * Post-delivery side effects: broadcasts, milestone detection, notifications, cache.
 */
export function orchestrateDeliveryRecorded(
  matchId: string,
  result: ScoringResult,
  context: DeliveryRecordedContext,
): void {
  if (context.inningsNum >= 2 && context.targetScore) {
    broadcastWinPrediction(matchId, result, context.targetScore, context.preDeliveryTotalWickets).catch((err) => {
      console.error('Win prediction broadcast error:', err);
    });
  }

  broadcastDeliveryUpdate(matchId, result).catch((err) => {
    console.error('Delivery broadcast error:', err);
  });

  detectAndBroadcastMilestones(
    matchId,
    result.delivery,
    result.scorecardSnapshot.innings_score,
    context.preInningsScore,
  ).catch((err) => {
    console.error('Milestone detection error:', err);
  });

  queueScoringNotifications(
    matchId,
    result.delivery,
    result.scorecardSnapshot.innings_score,
    context.preInningsScore,
    result.matchCompleted,
  ).catch((err) => {
    console.error('Notification queueing error:', err);
  });

  cacheSet(`match:${matchId}:live_score`, result.scorecardSnapshot, 60);
  cacheInvalidate(`match:${matchId}:scorecard`);
}

/**
 * Post-undo side effects: cache invalidation and status broadcast.
 */
export function orchestrateDeliveryUndone(matchId: string, overriddenDeliveryId: string): void {
  cacheInvalidate(`match:${matchId}:live_score`);
  cacheInvalidate(`match:${matchId}:scorecard`);

  broadcast.status(matchId, {
    status: 'undo',
    reason: `Ball ${overriddenDeliveryId} undone`,
  });
}
