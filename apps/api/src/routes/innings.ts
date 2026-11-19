import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { innings, match, matchTeam, matchFormatConfig, delivery } from '../db/schema/index';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { invalidateMatchCache } from '../services/cache';
import { resolveChaseTarget } from '../engine/chase-target';

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
  }>('/:id/innings', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    if (!req.body.battingOrder || req.body.battingOrder.length < 2) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'At least two batsmen are required to start an innings' },
      });
    }

    // Get next innings number
    const existingInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
    });
    if (existingInnings.some((inningsRow) => inningsRow.status === 'in_progress')) {
      return reply.status(409).send({
        error: { code: 'INNINGS_IN_PROGRESS', message: 'An innings is already in progress' },
      });
    }
    const nextNumber = existingInnings.length + 1;

    const formatConfig = await db.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, matchData.formatConfigId),
    });
    const firstInnings = existingInnings.find((inningsRow) => inningsRow.inningsNumber === 1);
    const officials = (matchData.matchOfficials ?? {}) as { dlsState?: { revisedTarget?: number } };
    const revisedTarget = officials.dlsState?.revisedTarget;
    const targetScore = resolveChaseTarget({
      nextInningsNumber: nextNumber,
      inningsPerSide: formatConfig?.inningsPerSide ?? 0,
      requestedTarget: req.body.targetScore,
      firstInningsRuns: firstInnings?.status === 'completed' ? firstInnings.totalRuns : null,
      revisedTarget: typeof revisedTarget === 'number' ? revisedTarget : null,
    });

    const bowlingSide = await db.query.matchTeam.findFirst({
      where: and(
        eq(matchTeam.matchId, req.params.id),
        eq(matchTeam.teamId, req.body.bowlingTeamId),
      ),
    });
    const bowlingXi = (bowlingSide?.playingXi || []).filter((id): id is string => id !== null);

    const newInnings = await db.transaction(async (tx) => {
      const [created] = await tx.insert(innings).values({
        matchId: req.params.id,
        inningsNumber: nextNumber,
        battingTeamId: req.body.battingTeamId,
        bowlingTeamId: req.body.bowlingTeamId,
        isSuperOver: req.body.isSuperOver ?? false,
        targetScore,
        status: 'in_progress',
        startedAt: new Date(),
      }).returning();

      await tx.insert(battingScorecard).values(req.body.battingOrder.map((playerId, idx) => ({
        inningsId: created.id,
        playerId,
        teamId: req.body.battingTeamId,
        battingPosition: idx + 1,
        didNotBat: idx >= 2,
      })));

      if (bowlingXi.length > 0) {
        await tx.insert(fieldingScorecard).values(bowlingXi.map((playerId) => ({
          inningsId: created.id,
          playerId,
          teamId: req.body.bowlingTeamId,
        })));
        await tx.insert(bowlingScorecard).values(bowlingXi.map((playerId, idx) => ({
          inningsId: created.id,
          playerId,
          teamId: req.body.bowlingTeamId,
          bowlingPosition: idx + 1,
        })));
      }

      return created;
    });

    await invalidateMatchCache(req.params.id);

    return reply.status(201).send(newInnings);
  });

  // Declare innings
  app.post<{ Params: { id: string; inningsId: string } }>(
    '/:id/innings/:inningsId/declare',
    { preHandler: [requireAuth] },
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
  }>('/:id/innings/:inningsId/bowler', { preHandler: [requireAuth] }, async (req, reply) => {
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
  // Validates that the player hasn't already batted (unless retired hurt returning)
  app.post<{
    Params: { id: string; inningsId: string };
    Body: { playerId: string; isRetiredHurtReturn?: boolean };
  }>('/:id/innings/:inningsId/new-batsman', { preHandler: [requireAuth] }, async (req, reply) => {
    // Check if the player already has a batting scorecard entry with didNotBat: false
    const existingEntry = await db.query.battingScorecard.findFirst({
      where: and(
        eq(battingScorecard.inningsId, req.params.inningsId),
        eq(battingScorecard.playerId, req.body.playerId),
      ),
    });

    if (existingEntry && !existingEntry.didNotBat) {
      // Player already batted — only allow if they were retired hurt and are returning
      if (!req.body.isRetiredHurtReturn) {
        // Check if they were retired hurt (isOut could be false if retired hurt, not dismissed)
        const wasRetiredHurt = existingEntry.dismissalType === 'retired_hurt'
          || existingEntry.isNotOut; // retired hurt players are marked not-out

        // Check delivery records for explicit retired-hurt flag
        const retiredHurtDelivery = await db.query.delivery.findFirst({
          where: and(
            eq(delivery.inningsId, req.params.inningsId),
            eq(delivery.dismissedId, req.body.playerId),
            eq(delivery.isRetiredHurt, true),
            eq(delivery.isOverridden, false),
          ),
        });

        if (!wasRetiredHurt && !retiredHurtDelivery) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Player has already batted in this innings. Only retired-hurt players can return.',
            },
          });
        }
      }

      // Retired hurt player returning — reset their out status so they can bat again
      await db.update(battingScorecard).set({
        isOut: false,
        dismissalType: null,
        isNotOut: true,
      }).where(eq(battingScorecard.id, existingEntry.id));

      return { success: true, retiredHurtReturn: true };
    }

    if (!existingEntry) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Player not found in batting order for this innings' },
      });
    }

    const [updated] = await db.update(battingScorecard).set({
      didNotBat: false,
    }).where(
      and(
        eq(battingScorecard.inningsId, req.params.inningsId),
        eq(battingScorecard.playerId, req.body.playerId),
      ),
    ).returning();

    return { success: true };
  });

  // ─── Session Tracking for Tests (multi-day matches) ──────────────────────
  // Session break: lunch / tea / stumps / rain
  app.post<{
    Params: { id: string };
    Body: {
      type: 'lunch' | 'tea' | 'stumps' | 'drinks' | 'rain';
      dayNumber?: number;
      sessionNumber?: number;
    };
  }>('/:id/session/break', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    const currentSession = (matchData.matchOfficials as any)?.session ?? {
      dayNumber: 1,
      sessionNumber: 1,
      isInBreak: false,
      breaks: [],
    };

    if (currentSession.isInBreak) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Match is already in a break' },
      });
    }

    const breakRecord = {
      type: req.body.type,
      dayNumber: req.body.dayNumber ?? currentSession.dayNumber,
      sessionNumber: req.body.sessionNumber ?? currentSession.sessionNumber,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };

    const updatedSession = {
      ...currentSession,
      isInBreak: true,
      currentBreakType: req.body.type,
      dayNumber: req.body.dayNumber ?? currentSession.dayNumber,
      sessionNumber: req.body.sessionNumber ?? currentSession.sessionNumber,
      breaks: [...(currentSession.breaks ?? []), breakRecord],
    };

    await db.update(match).set({
      matchOfficials: { ...(matchData.matchOfficials as Record<string, any> ?? {}), session: updatedSession },
      status: req.body.type === 'stumps' ? 'stumps' as any : matchData.status,
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id));

    return {
      success: true,
      session: updatedSession,
    };
  });

  // Session resume: after lunch / tea / next day
  app.post<{
    Params: { id: string };
    Body: {
      dayNumber?: number;
      sessionNumber?: number;
    };
  }>('/:id/session/resume', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    const currentSession = (matchData.matchOfficials as any)?.session ?? {
      dayNumber: 1,
      sessionNumber: 1,
      isInBreak: false,
      breaks: [],
    };

    if (!currentSession.isInBreak) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Match is not currently in a break' },
      });
    }

    // Close the current break
    const breaks = currentSession.breaks ?? [];
    if (breaks.length > 0) {
      breaks[breaks.length - 1].endedAt = new Date().toISOString();
    }

    // Advance day/session numbers
    const lastBreakType = currentSession.currentBreakType;
    let nextDay = req.body.dayNumber ?? currentSession.dayNumber;
    let nextSession = req.body.sessionNumber ?? currentSession.sessionNumber + 1;
    if (lastBreakType === 'stumps') {
      nextDay = req.body.dayNumber ?? currentSession.dayNumber + 1;
      nextSession = req.body.sessionNumber ?? 1; // first session of new day
    }

    const updatedSession = {
      ...currentSession,
      isInBreak: false,
      currentBreakType: null,
      dayNumber: nextDay,
      sessionNumber: nextSession,
      breaks,
    };

    await db.update(match).set({
      matchOfficials: { ...(matchData.matchOfficials as Record<string, any> ?? {}), session: updatedSession },
      status: 'live',
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id));

    return {
      success: true,
      session: updatedSession,
    };
  });

  // Enforce follow-on — context.md section 5.10
  app.post<{
    Params: { id: string; inningsId: string };
  }>('/:id/innings/:inningsId/follow-on', { preHandler: [requireAuth] }, async (req, reply) => {
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

    // Use follow-on threshold from format config, fallback to 200 (standard Test threshold)
    const threshold = formatConfig.followOnThreshold ?? 200;
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
