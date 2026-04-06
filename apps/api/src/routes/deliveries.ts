import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { delivery, innings, partnership, player, matchFormatConfig } from '../db/schema/index';
import { match, matchTeam } from '../db/schema/match';
import { teamFollow } from '../db/schema/follow';
import { team } from '../db/schema/team';
import { battingScorecard, bowlingScorecard } from '../db/schema/scorecard';
import { scoringEngine } from '../engine/scoring-engine';
import { broadcast } from '../services/realtime';
import { sendNotification } from '../services/notification-service';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { DeliveryInput, MilestoneEvent } from '@cricket/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, recordDeliverySchema } from '../middleware/validation';
import { cacheSet, cacheInvalidate } from '../services/cache';

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

  // 1. Batsman milestone — check if striker crossed a threshold
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
          break; // only broadcast the highest threshold crossed
        }
      }
    }
  }

  // 2. Bowler milestones — 5-wicket haul & hat-trick
  if (del.isWicket) {
    const bowlCard = await db.query.bowlingScorecard.findFirst({
      where: and(
        eq(bowlingScorecard.inningsId, del.inningsId),
        eq(bowlingScorecard.playerId, del.bowlerId),
      ),
    });

    // 5-wicket haul: fire only when they first reach exactly 5
    if (bowlCard && bowlCard.wicketsTaken === 5) {
      const name = await getPlayerName(del.bowlerId);
      milestones.push({
        type: 'five_wickets',
        player: { id: del.bowlerId, name },
        text: `${name} takes a 5-wicket haul! (5/${bowlCard.runsConceded})`,
      });
    }

    // Hat-trick: last 3 deliveries by this bowler in this innings are all wickets
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

  // 3. Team milestone — check if innings score crossed a threshold
  for (const threshold of TEAM_THRESHOLDS) {
    if (preInningsScore < threshold.runs && postInningsScore >= threshold.runs) {
      milestones.push({
        type: threshold.type,
        player: { id: '', name: 'Team' },
        text: `Team reaches ${threshold.label}!`,
      });
      break; // only broadcast the highest threshold crossed
    }
  }

  // Broadcast each detected milestone
  for (const milestone of milestones) {
    broadcast.milestone(matchId, milestone);
  }
}

/**
 * Queue push notifications for scoring events to followers of the teams in this match.
 * Checks for wickets, milestones, and match completion.
 */
async function queueScoringNotifications(
  matchId: string,
  deliveryRecord: typeof delivery.$inferSelect,
  postInningsScore: number,
  preInningsScore: number,
  matchCompleted: boolean,
): Promise<void> {
  const del = deliveryRecord;

  // Get the match record
  const matchRecord = await db.query.match.findFirst({ where: eq(match.id, matchId) });
  if (!matchRecord) return;

  // Get teams in this match with names
  const matchTeams = await db
    .select({ teamId: matchTeam.teamId, teamName: team.name })
    .from(matchTeam)
    .innerJoin(team, eq(matchTeam.teamId, team.id))
    .where(eq(matchTeam.matchId, matchId));
  const teamNames = matchTeams.map((t) => t.teamName).join(' vs ');

  // Get all users who follow any team in this match
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

  // Deduplicate follower IDs
  const followerIds = [...new Set(followers.map((f) => f.userId))];

  // Wicket notification
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

  // Milestone notifications (50, 100, etc.)
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

  // Match completion notification
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

/**
 * Delivery routes — context.md section 6.1
 *
 * POST   /api/matches/:id/deliveries         — submit ball
 * PATCH  /api/matches/:id/deliveries/:ballId — correct a past delivery (creates override)
 * DELETE /api/matches/:id/deliveries/last     — undo last ball (marks as overridden)
 */
export const deliveryRoutes: FastifyPluginAsync = async (app) => {
  // Submit a ball — context.md section 6.1
  app.post<{
    Params: { id: string };
    Body: Omit<DeliveryInput, 'matchId'> & { client_id?: string; expected_stack_pos?: number };
  }>('/:id/deliveries', { preHandler: [requireAuth, requireRole('scorer', 'admin'), validateBody(recordDeliverySchema)] }, async (req, reply) => {
    const validated = (req as any).validated ?? req.body;
    const input: DeliveryInput = {
      matchId: req.params.id,
      inningsNum: validated.innings_num,
      bowlerId: validated.bowler_id,
      strikerId: validated.striker_id,
      nonStrikerId: validated.non_striker_id,
      runsBatsman: validated.runs_batsman,
      runsExtras: validated.runs_extras,
      extraType: validated.extra_type,
      isWicket: validated.is_wicket ?? false,
      wicketType: validated.wicket_type,
      dismissedId: validated.dismissed_player_id,
      fielderIds: validated.fielder_id ? [validated.fielder_id] : [],
      shotType: validated.shot_type,
    };

    // Guard: reject deliveries if innings is already completed
    const liveInnings = await db.query.innings.findFirst({
      where: and(eq(innings.matchId, req.params.id), eq(innings.status, 'in_progress')),
    });
    if (!liveInnings) {
      return reply.status(400).send({
        error: { code: 'INNINGS_COMPLETED', message: 'No active innings — innings is already completed or not started' },
      });
    }

    // Sync conflict detection (context.md section 5.10) — check undo_stack_pos if provided
    if (req.body.expected_stack_pos !== undefined) {
      const latestDelivery = await db.query.delivery.findFirst({
        where: and(eq(delivery.matchId, req.params.id), eq(delivery.isOverridden, false)),
        orderBy: [desc(delivery.undoStackPos)],
      });
      const currentPos = latestDelivery?.undoStackPos ?? 0;

      if (currentPos !== req.body.expected_stack_pos) {
        const liveInnings = await db.query.innings.findFirst({
          where: and(eq(innings.matchId, req.params.id), eq(innings.status, 'in_progress')),
        });
        return reply.status(409).send({
          error: {
            code: 'SYNC_CONFLICT',
            message: 'Delivery conflicts with server state',
            details: {
              conflict_type: 'stack_position_mismatch',
              server_state: {
                current_undo_stack_pos: currentPos,
                innings_status: liveInnings?.status ?? 'unknown',
                innings_score: liveInnings?.totalRuns ?? 0,
                innings_wickets: liveInnings?.totalWickets ?? 0,
                innings_overs: liveInnings?.totalOvers ?? '0.0',
                last_delivery_id: latestDelivery?.id ?? null,
              },
            },
          },
          status: 409,
        });
      }
    }

    // Idempotency check: if client_id already exists, return the existing delivery
    if (req.body.client_id) {
      const existingDelivery = await db.query.delivery.findFirst({
        where: eq(delivery.clientId, req.body.client_id),
      });
      if (existingDelivery) {
        return reply.status(200).send({
          delivery: existingDelivery,
          commentary: null,
          overCompleted: false,
          inningsCompleted: false,
          matchCompleted: false,
          newStrikerId: existingDelivery.strikerId,
          newNonStrikerId: existingDelivery.nonStrikerId,
          scorecardSnapshot: {
            innings_score: existingDelivery.inningsScore,
            innings_wickets: existingDelivery.inningsWickets,
            innings_overs: existingDelivery.inningsOvers,
            run_rate: parseFloat(existingDelivery.runRate),
          },
          idempotent: true,
        });
      }
    }

    // Capture pre-delivery innings score for milestone threshold detection
    const preDeliveryInningsScore = liveInnings.totalRuns ?? 0;

    let result;
    try {
      result = await scoringEngine.recordDelivery(input, req.body.client_id);
    } catch (err: any) {
      if (err.message?.startsWith('VALIDATION_ERROR:')) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: err.message.replace('VALIDATION_ERROR: ', '') },
          status: 400,
        });
      }
      throw err;
    }

    // ── Win Prediction broadcast (2nd innings chase) ──────────────────────
    if (input.inningsNum >= 2 && liveInnings.targetScore) {
      const target = liveInnings.targetScore;
      const currentScore = result.scorecardSnapshot.innings_score ?? 0;
      const oversStr = String(result.scorecardSnapshot.innings_overs ?? '0.0');
      const oversParts = oversStr.split('.');
      const completedOvers = parseInt(oversParts[0], 10) || 0;
      const partialBalls = parseInt(oversParts[1] || '0', 10);
      const totalBallsBowled = completedOvers * 6 + partialBalls;

      // Get overs per innings from match format config
      const matchRecord = await db.query.match.findFirst({ where: eq(match.id, req.params.id) });
      const formatConfig = matchRecord?.formatConfigId
        ? await db.query.matchFormatConfig.findFirst({ where: eq(matchFormatConfig.id, matchRecord.formatConfigId) })
        : null;
      const totalOvers = formatConfig?.oversPerInnings ?? 20;
      const totalBallsInInnings = totalOvers * 6;
      const remainingBalls = Math.max(totalBallsInInnings - totalBallsBowled, 1);

      const currentRunRate = totalBallsBowled > 0 ? (currentScore / totalBallsBowled) * 6 : 0;
      const requiredRunRate = ((target - currentScore) / remainingBalls) * 6;

      // Simple win probability heuristic (placeholder until ML model)
      let winProbChasing: number;
      if (currentScore >= target) {
        winProbChasing = 100;
      } else if (remainingBalls <= 0 || (liveInnings.totalWickets ?? 0) >= 10) {
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

      // Projected score: extrapolate from current run rate
      const projectedLow = Math.round(currentScore + (remainingBalls / 6) * currentRunRate * 0.85);
      const projectedHigh = Math.round(currentScore + (remainingBalls / 6) * currentRunRate * 1.15);

      broadcast.prediction(req.params.id, {
        winProbA: 100 - winProbChasing,
        winProbB: winProbChasing,
        projectedScoreLow: projectedLow,
        projectedScoreHigh: projectedHigh,
      });
    }

    // Broadcast via WebSocket — context.md section 6.2
    if (result.delivery.isWicket) {
      const endedPartnership = await db.query.partnership.findFirst({
        where: and(
          eq(partnership.inningsId, result.delivery.inningsId),
          eq(partnership.isActive, false),
        ),
        orderBy: [desc(partnership.createdAt)],
      });

      broadcast.wicket(req.params.id, {
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
      broadcast.delivery(req.params.id, {
        delivery: result.delivery as any,
        scorecardSnapshot: result.scorecardSnapshot as any,
        commentary: result.commentary,
      });
    }

    // Broadcast over completion with actual bowler stats
    if (result.overCompleted) {
      const bowlerCard = await db.query.bowlingScorecard.findFirst({
        where: and(
          eq(bowlingScorecard.inningsId, result.delivery.inningsId),
          eq(bowlingScorecard.playerId, result.delivery.bowlerId),
        ),
      });

      broadcast.over(req.params.id, {
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

    // Detect and broadcast milestones (batsman 50/100/150/200, bowler 5w/hat-trick, team 100/200/300)
    detectAndBroadcastMilestones(
      req.params.id,
      result.delivery,
      result.scorecardSnapshot.innings_score,
      preDeliveryInningsScore,
    ).catch((err) => {
      // Non-blocking — milestone detection failure should never break scoring
      console.error('Milestone detection error:', err);
    });

    // Queue push notifications for subscribed followers — non-blocking
    queueScoringNotifications(
      req.params.id,
      result.delivery,
      result.scorecardSnapshot.innings_score,
      preDeliveryInningsScore,
      result.matchCompleted,
    ).catch((err) => {
      console.error('Notification queueing error:', err);
    });

    // Update Redis caches — non-blocking, failures are silent
    cacheSet(`match:${req.params.id}:live_score`, result.scorecardSnapshot, 60);
    cacheInvalidate(`match:${req.params.id}:scorecard`);

    return reply.status(201).send({
      delivery: result.delivery,
      commentary: result.commentary,
      overCompleted: result.overCompleted,
      inningsCompleted: result.inningsCompleted,
      matchCompleted: result.matchCompleted,
      newStrikerId: result.newStrikerId,
      newNonStrikerId: result.newNonStrikerId,
      scorecardSnapshot: result.scorecardSnapshot,
      powerplay: result.scorecardSnapshot.powerplay,
    });
  });

  // Get deliveries — supports filtering by innings
  app.get<{
    Params: { id: string };
    Querystring: { innings_num?: string };
  }>('/:id/deliveries', async (req) => {
    const conditions = [eq(delivery.matchId, req.params.id), eq(delivery.isOverridden, false)];

    return db.query.delivery.findMany({
      where: and(...conditions),
      orderBy: [desc(delivery.undoStackPos)],
    });
  });

  // Undo last ball — context.md: marks as overridden (immutable, never deletes)
  app.delete<{
    Params: { id: string };
    Body: { inningsId: string };
  }>('/:id/deliveries/last', { preHandler: [requireAuth] }, async (req, reply) => {
    const result = await scoringEngine.undoLastBall(req.params.id, req.body.inningsId);

    if (!result.success) {
      return reply.status(404).send({ error: 'No delivery to undo' });
    }

    // Invalidate caches — undo changes the scorecard
    cacheInvalidate(`match:${req.params.id}:live_score`);
    cacheInvalidate(`match:${req.params.id}:scorecard`);

    // Broadcast status update
    broadcast.status(req.params.id, {
      status: 'undo',
      reason: `Ball ${result.overriddenId} undone`,
    });

    return { success: true, overriddenDeliveryId: result.overriddenId };
  });

  // Correct a past delivery — creates override record (immutable)
  app.patch<{
    Params: { id: string; ballId: string };
    Body: Partial<DeliveryInput>;
  }>('/:id/deliveries/:ballId', { preHandler: [requireAuth] }, async (req, reply) => {
    const result = await scoringEngine.correctDelivery(req.params.ballId, req.body);

    if (!result.success) {
      return reply.status(404).send({ error: 'Delivery not found' });
    }

    return { success: true, newDeliveryId: result.newDeliveryId };
  });

  // Batch undo — undo multiple balls from a given stack position onward
  app.delete<{
    Params: { id: string };
    Querystring: { from_stack_pos: string; inningsId: string };
  }>('/:id/deliveries/batch', { preHandler: [requireAuth] }, async (req, reply) => {
    const fromPos = parseInt(req.query.from_stack_pos, 10);
    const inningsId = req.query.inningsId;
    if (isNaN(fromPos)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'from_stack_pos must be a number' } });
    }

    // Get all non-overridden deliveries at or after the position
    const deliveriesToUndo = await db.query.delivery.findMany({
      where: and(
        eq(delivery.inningsId, inningsId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
    });

    const toUndo = deliveriesToUndo.filter(d => d.undoStackPos >= fromPos);
    if (toUndo.length === 0) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No deliveries to undo from that position' } });
    }

    // Mark all as overridden
    for (const d of toUndo) {
      await db.update(delivery).set({ isOverridden: true }).where(eq(delivery.id, d.id));
    }

    // Revert innings to snapshot before the batch
    const remaining = deliveriesToUndo.find(d => d.undoStackPos < fromPos);
    if (remaining) {
      await db.update(innings).set({
        totalRuns: remaining.inningsScore,
        totalWickets: remaining.inningsWickets,
        totalOvers: remaining.inningsOvers,
      }).where(eq(innings.id, inningsId));
    } else {
      await db.update(innings).set({
        totalRuns: 0, totalWickets: 0, totalOvers: '0.0', totalExtras: 0,
      }).where(eq(innings.id, inningsId));
    }

    // Invalidate caches — batch undo changes the scorecard
    cacheInvalidate(`match:${req.params.id}:live_score`);
    cacheInvalidate(`match:${req.params.id}:scorecard`);

    broadcast.status(req.params.id, {
      status: 'batch_undo',
      reason: `${toUndo.length} deliveries undone from position ${fromPos}`,
    });

    return { success: true, undoneCount: toUndo.length };
  });
};
