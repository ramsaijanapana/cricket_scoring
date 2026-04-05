import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { delivery, innings } from '../db/schema/index';
import { bowlingScorecard } from '../db/schema/scorecard';
import { scoringEngine } from '../engine/scoring-engine';
import { broadcast } from '../services/realtime';
import { eq, and, desc } from 'drizzle-orm';
import type { DeliveryInput } from '@cricket/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, recordDeliverySchema } from '../middleware/validation';

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

    // Broadcast via WebSocket — context.md section 6.2
    if (result.delivery.isWicket) {
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
        partnershipEnded: null as any, // TODO: compute partnership
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

    return reply.status(201).send({
      delivery: result.delivery,
      commentary: result.commentary,
      overCompleted: result.overCompleted,
      inningsCompleted: result.inningsCompleted,
      matchCompleted: result.matchCompleted,
      newStrikerId: result.newStrikerId,
      newNonStrikerId: result.newNonStrikerId,
      scorecardSnapshot: result.scorecardSnapshot,
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

    broadcast.status(req.params.id, {
      status: 'batch_undo',
      reason: `${toUndo.length} deliveries undone from position ${fromPos}`,
    });

    return { success: true, undoneCount: toUndo.length };
  });
};
