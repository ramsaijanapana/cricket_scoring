import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { match, matchTeam, innings, matchFormatConfig, delivery, team, substitution } from '../db/schema/index';
import { player } from '../db/schema/player';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { broadcast } from '../services/realtime';
import { requireAuth, requireRole, getUserId } from '../middleware/auth';
import { validateBody, createMatchSchema } from '../middleware/validation';
import { parsePagination, paginatedResponse } from '../middleware/pagination';
import { cacheGet, cacheSet, invalidateMatchCache } from '../services/cache';
import { dlsEngine, type DLSInterruption } from '../engine/dls-engine';

// Valid match status transitions
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  created: ['toss_decided'],
  toss_decided: ['in_progress'],
  in_progress: ['completed', 'interrupted'],
  interrupted: ['in_progress'],
};

export const matchRoutes: FastifyPluginAsync = async (app) => {
  // List all matches — enriched with team names (excludes soft-deleted)
  app.get('/', async (req) => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const matches = await db.query.match.findMany({
      where: eq(match.isDeleted, false),
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit,
      offset,
    });

    if (matches.length === 0) return [];

    const matchIds = matches.map(m => m.id);

    // Batch-fetch all match teams and innings in 2 queries (was N+1)
    const [allMatchTeams, allInnings] = await Promise.all([
      db.query.matchTeam.findMany({
        where: inArray(matchTeam.matchId, matchIds),
      }),
      db.query.innings.findMany({
        where: inArray(innings.matchId, matchIds),
        orderBy: (i, { desc }) => [desc(i.inningsNumber)],
      }),
    ]);

    // Batch-fetch all referenced teams
    const teamIds = [...new Set(allMatchTeams.map(t => t.teamId))];
    const allTeams = teamIds.length > 0
      ? await db.query.team.findMany({ where: inArray(team.id, teamIds) })
      : [];
    const teamMap = Object.fromEntries(allTeams.map(t => [t.id, t]));

    // Group match teams by matchId
    const matchTeamsByMatch = new Map<string, typeof allMatchTeams>();
    for (const mt of allMatchTeams) {
      const arr = matchTeamsByMatch.get(mt.matchId) || [];
      arr.push(mt);
      matchTeamsByMatch.set(mt.matchId, arr);
    }

    // Latest innings per match (first per matchId since ordered desc)
    const latestInningsByMatch = new Map<string, typeof allInnings[number]>();
    for (const inn of allInnings) {
      if (!latestInningsByMatch.has(inn.matchId)) {
        latestInningsByMatch.set(inn.matchId, inn);
      }
    }

    // Map in JS — no more per-match queries
    const enriched = matches.map((m) => {
      const teams = matchTeamsByMatch.get(m.id) || [];
      const teamDetails = teams.map(t => ({
        ...t,
        teamName: teamMap[t.teamId]?.name || 'Unknown',
      }));
      const homeTeam = teamDetails.find(t => t.designation === 'home');
      const awayTeam = teamDetails.find(t => t.designation === 'away');
      const latestInnings = latestInningsByMatch.get(m.id);

      return {
        ...m,
        homeTeamName: homeTeam?.teamName || 'TBD',
        awayTeamName: awayTeam?.teamName || 'TBD',
        currentScore: latestInnings ? `${latestInnings.totalRuns}/${latestInnings.totalWickets}` : null,
        currentOvers: latestInnings?.totalOvers || null,
        teams: teamDetails,
      };
    });

    return paginatedResponse(enriched, page, limit);
  });

  // Get match by ID with teams (enriched) and innings
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    // Check Redis cache first
    const cacheKey = `match:${req.params.id}:detail`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return cached;

    const result = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!result) return reply.status(404).send({ error: 'Match not found' });

    const teams = await db.query.matchTeam.findMany({
      where: eq(matchTeam.matchId, req.params.id),
    });

    // Enrich teams with names + playing XI player names
    const enrichedTeams = await Promise.all(
      teams.map(async (t) => {
        const teamData = await db.query.team.findFirst({ where: eq(team.id, t.teamId) });
        // Resolve player names for the playing XI
        const xiIds = (t.playingXi || []).filter((id): id is string => id !== null);
        const xiPlayers = xiIds.length > 0
          ? await db.query.player.findMany({ where: inArray(player.id, xiIds) })
          : [];
        const playerNames: Record<string, string> = {};
        for (const p of xiPlayers) {
          playerNames[p.id] = `${p.firstName} ${p.lastName}`.trim() || 'Player';
        }
        return { ...t, teamName: teamData?.name || 'Unknown', playerNames };
      })
    );

    const matchInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    // Enrich each innings with batting and bowling scorecards + player names
    const enrichedInnings = await Promise.all(
      matchInnings.map(async (inn) => {
        const [batCards, bowlCards] = await Promise.all([
          db.query.battingScorecard.findMany({
            where: eq(battingScorecard.inningsId, inn.id),
            orderBy: (bs, { asc }) => [asc(bs.battingPosition)],
          }),
          db.query.bowlingScorecard.findMany({
            where: eq(bowlingScorecard.inningsId, inn.id),
            orderBy: (bs, { asc }) => [asc(bs.bowlingPosition)],
          }),
        ]);

        // Fetch player names for scorecard entries
        const playerIds = [
          ...batCards.map(b => b.playerId),
          ...bowlCards.map(b => b.playerId),
        ].filter(Boolean);
        const uniquePlayerIds = [...new Set(playerIds)];
        const players = uniquePlayerIds.length > 0
          ? await db.query.player.findMany({ where: inArray(player.id, uniquePlayerIds) })
          : [];
        const playerMap = Object.fromEntries(players.map(p => [p.id, p]));
        const getPlayerName = (pid: string, fallback: string) => {
          const p = playerMap[pid];
          if (!p) return fallback;
          return `${p.firstName} ${p.lastName}`.trim() || fallback;
        };

        return {
          ...inn,
          battingScorecard: batCards.map(b => ({
            ...b,
            playerName: getPlayerName(b.playerId, `Player`),
          })),
          bowlingScorecard: bowlCards.map(b => ({
            ...b,
            playerName: getPlayerName(b.playerId, `Bowler`),
          })),
        };
      })
    );

    const matchDetail = { ...result, teams: enrichedTeams, innings: enrichedInnings };

    // Cache match detail with 5-minute TTL
    cacheSet(cacheKey, matchDetail, 300);

    return matchDetail;
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
  }>('/', { preHandler: [requireAuth, requireRole('scorer', 'admin'), validateBody(createMatchSchema)] }, async (req, reply) => {
    const body = (req as any).validated ?? req.body;

    // Verify both teams exist
    const [homeTeam, awayTeam] = await Promise.all([
      db.query.team.findFirst({ where: eq(team.id, body.homeTeamId) }),
      db.query.team.findFirst({ where: eq(team.id, body.awayTeamId) }),
    ]);
    if (!homeTeam) return reply.status(404).send({ error: `Home team not found: ${body.homeTeamId}` });
    if (!awayTeam) return reply.status(404).send({ error: `Away team not found: ${body.awayTeamId}` });

    // Resolve formatConfigId: accept UUID or format name (e.g. 't20', 'odi', 'test')
    let resolvedFormatConfigId = body.formatConfigId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.formatConfigId);
    if (!isUuid) {
      const formatDefaults: Record<string, { name: string; oversPerInnings: number | null; inningsPerSide: number; maxBowlerOvers: number | null; hasSuperOver: boolean; hasDls: boolean; hasFollowOn: boolean; followOnThreshold: number | null }> = {
        t20: { name: 'T20', oversPerInnings: 20, inningsPerSide: 1, maxBowlerOvers: 4, hasSuperOver: true, hasDls: true, hasFollowOn: false, followOnThreshold: null },
        odi: { name: 'ODI', oversPerInnings: 50, inningsPerSide: 1, maxBowlerOvers: 10, hasSuperOver: true, hasDls: true, hasFollowOn: false, followOnThreshold: null },
        test: { name: 'Test', oversPerInnings: null, inningsPerSide: 2, maxBowlerOvers: null, hasSuperOver: false, hasDls: false, hasFollowOn: true, followOnThreshold: 200 },
        t10: { name: 'T10', oversPerInnings: 10, inningsPerSide: 1, maxBowlerOvers: 2, hasSuperOver: true, hasDls: false, hasFollowOn: false, followOnThreshold: null },
        hundred: { name: 'The Hundred', oversPerInnings: 20, inningsPerSide: 1, maxBowlerOvers: 4, hasSuperOver: true, hasDls: false, hasFollowOn: false, followOnThreshold: null },
        custom: { name: 'Custom', oversPerInnings: null, inningsPerSide: 2, maxBowlerOvers: null, hasSuperOver: false, hasDls: false, hasFollowOn: false, followOnThreshold: null },
      };

      const formatKey = body.formatConfigId.toLowerCase();
      const defaults = formatDefaults[formatKey];
      const formatName = defaults?.name || body.formatConfigId;

      // Look up existing config by name
      const existing = await db.query.matchFormatConfig.findFirst({
        where: eq(matchFormatConfig.name, formatName),
      });

      if (existing) {
        resolvedFormatConfigId = existing.id;
      } else if (defaults) {
        const [created] = await db.insert(matchFormatConfig).values({
          name: defaults.name,
          oversPerInnings: defaults.oversPerInnings,
          inningsPerSide: defaults.inningsPerSide,
          maxBowlerOvers: defaults.maxBowlerOvers,
          hasSuperOver: defaults.hasSuperOver,
          hasDls: defaults.hasDls,
          hasFollowOn: defaults.hasFollowOn,
          followOnThreshold: defaults.followOnThreshold,
          ballsPerOver: 6,
        }).returning();
        resolvedFormatConfigId = created.id;
      } else {
        return reply.status(400).send({ error: `Unknown format: ${body.formatConfigId}` });
      }
    }

    // Create match
    const [newMatch] = await db.insert(match).values({
      formatConfigId: resolvedFormatConfigId,
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
  }>('/:id/start', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    // Update match status to live
    await db.update(match).set({
      status: 'live',
      actualStart: new Date(),
    }).where(eq(match.id, req.params.id));

    // If no batting order provided, create placeholder players
    let battingOrder = req.body.battingOrder || [];
    if (battingOrder.length === 0) {
      const placeholders = [];
      for (let i = 1; i <= 11; i++) {
        const [p] = await db.insert(player).values({
          firstName: `Player`,
          lastName: `${i}`,
        }).returning();
        placeholders.push(p.id);
      }
      battingOrder = placeholders;

      // Also create 11 placeholder bowlers for the bowling team
      const bowlerPlaceholders = [];
      for (let i = 1; i <= 11; i++) {
        const [p] = await db.insert(player).values({
          firstName: `Bowler`,
          lastName: `${i}`,
        }).returning();
        bowlerPlaceholders.push(p.id);
      }

      // Update playing XI on match teams
      await db.update(matchTeam).set({ playingXi: battingOrder })
        .where(and(eq(matchTeam.matchId, req.params.id), eq(matchTeam.teamId, req.body.battingTeamId)));
      await db.update(matchTeam).set({ playingXi: bowlerPlaceholders })
        .where(and(eq(matchTeam.matchId, req.params.id), eq(matchTeam.teamId, req.body.bowlingTeamId)));
    }

    // Create first innings
    const [newInnings] = await db.insert(innings).values({
      matchId: req.params.id,
      inningsNumber: 1,
      battingTeamId: req.body.battingTeamId,
      bowlingTeamId: req.body.bowlingTeamId,
      status: 'in_progress',
      startedAt: new Date(),
    }).returning();

    // Initialize batting scorecards for all players in batting order (skip if empty)
    if (battingOrder.length > 0) {
      const battingScorecardEntries = battingOrder.map((playerId: string, idx: number) => ({
        inningsId: newInnings.id,
        playerId,
        teamId: req.body.battingTeamId,
        battingPosition: idx + 1,
        didNotBat: idx >= 2,
      }));
      await db.insert(battingScorecard).values(battingScorecardEntries);
    }

    // Get bowling team's playing XI for fielding scorecards (skip if empty)
    const bowlingTeamMatch = await db.query.matchTeam.findFirst({
      where: and(eq(matchTeam.matchId, req.params.id), eq(matchTeam.teamId, req.body.bowlingTeamId)),
    });

    if (bowlingTeamMatch?.playingXi && bowlingTeamMatch.playingXi.length > 0) {
      const validBowlerIds = bowlingTeamMatch.playingXi.filter((id): id is string => id !== null);

      // Create fielding scorecards
      const fieldingScorecardEntries = validBowlerIds.map(playerId => ({
        inningsId: newInnings.id,
        playerId,
        teamId: req.body.bowlingTeamId,
      }));
      await db.insert(fieldingScorecard).values(fieldingScorecardEntries);

      // Create bowling scorecards so the scoring engine can update them
      const bowlingScorecardEntries = validBowlerIds.map((playerId, idx) => ({
        inningsId: newInnings.id,
        playerId,
        teamId: req.body.bowlingTeamId,
        bowlingPosition: idx + 1,
      }));
      await db.insert(bowlingScorecard).values(bowlingScorecardEntries);
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
  }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    // Validate status transition if status is being changed
    if (req.body.status) {
      const currentMatch = await db.query.match.findFirst({
        where: eq(match.id, req.params.id),
      });
      if (!currentMatch) return reply.status(404).send({ error: 'Match not found' });

      const currentStatus = currentMatch.status;
      const newStatus = req.body.status;
      const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];

      if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
        return reply.status(400).send({
          error: `Invalid status transition from '${currentStatus}' to '${newStatus}'`,
        });
      }
    }

    const [updated] = await db.update(match).set({
      ...req.body,
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Match not found' });

    // Invalidate all match caches on state change
    invalidateMatchCache(req.params.id);

    return updated;
  });

  // Record toss — context.md section 6.1
  app.post<{
    Params: { id: string };
    Body: { winner_id: string; decision: 'bat' | 'field' };
  }>('/:id/toss', { preHandler: [requireAuth] }, async (req, reply) => {
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
  // Also captures DLS state at the point of interruption for par-score recalculation.
  app.post<{
    Params: { id: string };
    Body: { reason: string; timestamp?: string };
  }>('/:id/interruption', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    // Capture current innings state for DLS
    const liveInnings = await db.query.innings.findFirst({
      where: and(eq(innings.matchId, req.params.id), eq(innings.status, 'in_progress')),
    });

    // Build DLS interruption record if there's an active innings
    let dlsInterruptionData: DLSInterruption | null = null;
    if (liveInnings) {
      dlsInterruptionData = {
        oversAtInterruption: parseFloat(String(liveInnings.totalOvers)) || 0,
        scoreAtInterruption: liveInnings.totalRuns,
        wicketsLostAtInterruption: liveInnings.totalWickets,
        oversLost: 0, // will be filled on resume when revised overs are known
      };
    }

    // Store interruption history in match officials JSON (reused for DLS tracking)
    const existingInterruptions = (matchData.matchOfficials as any)?.dlsInterruptions ?? [];
    const updatedInterruptions = dlsInterruptionData
      ? [...existingInterruptions, dlsInterruptionData]
      : existingInterruptions;

    const [updated] = await db.update(match).set({
      status: 'rain_delay',
      matchOfficials: {
        ...(matchData.matchOfficials as Record<string, unknown> ?? {}),
        dlsInterruptions: updatedInterruptions,
      },
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id)).returning();

    broadcast.status(req.params.id, {
      status: 'rain_delay',
      reason: req.body.reason,
      dlsInterruption: dlsInterruptionData,
    });

    return updated;
  });

  // Resume match after interruption — context.md section 6.1
  // Calculates DLS revised target when overs are reduced.
  app.post<{
    Params: { id: string };
    Body: { timestamp?: string; revised_overs?: number };
  }>('/:id/resume', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    const formatConfig = await db.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, matchData.formatConfigId),
    });

    // Fetch all innings for this match
    const allInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    let dlsParScore: number | null = null;
    let dlsState: { parScore: number; revisedTarget: number | null; team1Resources: number; team2Resources: number } | null = null;

    // Calculate DLS if format supports it and overs were reduced
    if (formatConfig?.hasDls && req.body.revised_overs != null && formatConfig.oversPerInnings) {
      const originalOvers = formatConfig.oversPerInnings;
      const revisedOvers = req.body.revised_overs;

      // Get DLS interruption history
      const officials = matchData.matchOfficials as Record<string, unknown> ?? {};
      const dlsInterruptions: DLSInterruption[] = (officials.dlsInterruptions as DLSInterruption[]) ?? [];

      // Update the most recent interruption with overs lost
      if (dlsInterruptions.length > 0) {
        const lastInterruption = dlsInterruptions[dlsInterruptions.length - 1];

        // Calculate overs lost: difference between what was available and what's now available
        const oversUsedAtInterruption = lastInterruption.oversAtInterruption;
        const oversRemainingBefore = originalOvers - oversUsedAtInterruption;
        const oversRemainingAfter = revisedOvers - oversUsedAtInterruption;
        lastInterruption.oversLost = Math.max(0, oversRemainingBefore - oversRemainingAfter);
      }

      // If we have a completed first innings, calculate revised target for second innings
      const firstInnings = allInnings.find(i => i.inningsNumber === 1);
      const secondInnings = allInnings.find(i => i.inningsNumber === 2);

      if (firstInnings && firstInnings.status === 'completed') {
        const result = dlsEngine.calculateRevisedTarget({
          team1Score: firstInnings.totalRuns,
          team1TotalOvers: originalOvers,
          team1WicketsLost: firstInnings.totalWickets,
          team1InningsComplete: true,
          team2TotalOvers: revisedOvers,
          interruptions: dlsInterruptions,
        });

        dlsParScore = result.parScore;
        dlsState = {
          parScore: result.parScore,
          revisedTarget: result.revisedTarget,
          team1Resources: result.team1Resources,
          team2Resources: result.team2Resources,
        };

        // Update the second innings target if it exists
        if (secondInnings) {
          await db.update(innings).set({
            targetScore: result.revisedTarget,
          }).where(eq(innings.id, secondInnings.id));
        }
      } else if (firstInnings && firstInnings.status === 'in_progress') {
        // First innings interrupted — team 1's resources are reduced too
        const team1Resources = dlsEngine.getResourcePercentage(originalOvers, 0);
        const team1UsedResources = team1Resources - dlsEngine.getResourcePercentage(
          Math.max(0, revisedOvers - parseFloat(String(firstInnings.totalOvers))),
          firstInnings.totalWickets,
        );
        dlsParScore = null; // Will be calculated when second innings starts
      }

      // Store updated interruption history
      await db.update(match).set({
        matchOfficials: {
          ...(matchData.matchOfficials as Record<string, unknown> ?? {}),
          dlsInterruptions,
          dlsState,
        },
      }).where(eq(match.id, req.params.id));
    }

    const updateFields: Record<string, unknown> = {
      status: 'live',
      updatedAt: new Date(),
    };
    if (dlsParScore !== null) {
      updateFields.isDlsApplied = true;
      updateFields.dlsParScore = dlsParScore;
    }

    const [updated] = await db.update(match).set(updateFields).where(eq(match.id, req.params.id)).returning();

    broadcast.status(req.params.id, {
      status: 'resumed',
      reason: 'Match resumed',
      dlsState,
    });

    return { ...updated, dlsState };
  });

  // DLS state — returns current DLS calculation state for a match
  app.get<{ Params: { id: string } }>('/:id/dls', async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    const formatConfig = await db.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, matchData.formatConfigId),
    });
    if (!formatConfig?.hasDls) {
      return reply.status(400).send({ error: 'DLS is not enabled for this match format' });
    }

    const allInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    const firstInnings = allInnings.find(i => i.inningsNumber === 1);
    const secondInnings = allInnings.find(i => i.inningsNumber === 2);
    const originalOvers = formatConfig.oversPerInnings ?? 50;

    const officials = matchData.matchOfficials as Record<string, unknown> ?? {};
    const dlsInterruptions: DLSInterruption[] = (officials.dlsInterruptions as DLSInterruption[]) ?? [];
    const storedDlsState = officials.dlsState as Record<string, unknown> | undefined;

    // If no first innings or no interruptions, return baseline state
    if (!firstInnings) {
      return {
        matchId: req.params.id,
        isDlsApplied: matchData.isDlsApplied,
        dlsParScore: matchData.dlsParScore,
        team1Resources: dlsEngine.getResourcePercentage(originalOvers, 0),
        team2Resources: dlsEngine.getResourcePercentage(originalOvers, 0),
        revisedTarget: null,
        parScore: null,
        interruptions: dlsInterruptions,
        baselineScore: dlsEngine.getBaselineScore(originalOvers),
      };
    }

    // Calculate live DLS state
    const team1Complete = firstInnings.status === 'completed';

    // Determine effective team 2 overs (may have been reduced)
    let team2Overs = originalOvers;
    const totalOversLost = dlsInterruptions.reduce((sum, i) => sum + i.oversLost, 0);
    if (totalOversLost > 0) {
      team2Overs = originalOvers - totalOversLost;
    }

    const result = dlsEngine.calculateRevisedTarget({
      team1Score: firstInnings.totalRuns,
      team1TotalOvers: originalOvers,
      team1WicketsLost: firstInnings.totalWickets,
      team1InningsComplete: team1Complete,
      team2TotalOvers: team2Overs,
      interruptions: dlsInterruptions,
    });

    // Calculate current par if second innings is in progress
    let currentPar: number | null = null;
    if (secondInnings && secondInnings.status === 'in_progress') {
      currentPar = dlsEngine.getCurrentParScore(
        firstInnings.totalRuns,
        originalOvers,
        team1Complete,
        team2Overs,
        parseFloat(String(secondInnings.totalOvers)) || 0,
        secondInnings.totalWickets,
        dlsInterruptions,
      );
    }

    return {
      matchId: req.params.id,
      isDlsApplied: matchData.isDlsApplied,
      dlsParScore: matchData.dlsParScore,
      team1Resources: result.team1Resources,
      team2Resources: result.team2Resources,
      revisedTarget: result.revisedTarget,
      parScore: result.parScore,
      currentPar,
      interruptions: result.interruptions,
      baselineScore: dlsEngine.getBaselineScore(originalOvers),
    };
  });

  // Initiate super over — context.md section 6.1
  // Enforces: max 1 over per side, exactly 2 batsmen, proper innings creation
  // If both super overs are tied -> compare boundary count -> allow another super over
  app.post<{
    Params: { id: string };
    Body: {
      battingTeamId: string;
      bowlingTeamId: string;
      battingOrder: string[]; // exactly 2 batsmen for super over
      bowlerId: string;       // selected bowler
    };
  }>('/:id/super-over', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    // Validate format allows super overs
    const formatConfig = await db.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, matchData.formatConfigId),
    });
    if (!formatConfig?.hasSuperOver) {
      return reply.status(422).send({
        error: { code: 'FORMAT_RULE_VIOLATION', message: 'Super over is not allowed in this format' },
      });
    }

    // Validate exactly 2 batsmen selected
    if (!req.body.battingOrder || req.body.battingOrder.length !== 2) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Super over requires exactly 2 batsmen' },
      });
    }

    const existingInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    // Check if there's a completed super-over pair that's tied — compare boundary count
    const completedSuperOvers = existingInnings.filter(i => i.isSuperOver && i.status === 'completed');
    if (completedSuperOvers.length >= 2 && completedSuperOvers.length % 2 === 0) {
      const lastPair = completedSuperOvers.slice(-2);
      if (lastPair[0].totalRuns === lastPair[1].totalRuns) {
        // Tied super over — check boundary count from regular innings
        const regularInnings = existingInnings.filter(i => !i.isSuperOver);
        if (regularInnings.length >= 2) {
          const countBoundaries = async (inningsId: string) => {
            const deliveries = await db.query.delivery.findMany({
              where: and(eq(delivery.inningsId, inningsId), eq(delivery.isOverridden, false)),
            });
            return deliveries.reduce((count, d) => count + (d.runsBatsman === 4 || d.runsBatsman === 6 ? 1 : 0), 0);
          };

          const [boundaries1, boundaries2] = await Promise.all([
            countBoundaries(regularInnings[0].id),
            countBoundaries(regularInnings[1].id),
          ]);

          // If boundary counts differ, declare winner
          if (boundaries1 !== boundaries2) {
            const winnerId = boundaries1 > boundaries2
              ? regularInnings[0].battingTeamId
              : regularInnings[1].battingTeamId;

            await db.update(match).set({
              status: 'completed',
              winnerTeamId: winnerId,
              resultSummary: `Won by boundary count (${Math.max(boundaries1, boundaries2)}-${Math.min(boundaries1, boundaries2)})`,
              updatedAt: new Date(),
            }).where(eq(match.id, req.params.id));

            broadcast.status(req.params.id, {
              status: 'completed',
              reason: 'Match decided by boundary count after tied super over',
            });

            return reply.status(200).send({
              matchCompleted: true,
              winnerId,
              reason: 'boundary_count',
              boundaries: { team1: boundaries1, team2: boundaries2 },
            });
          }
          // Boundary counts also tied — allow another super over (fall through)
        }
      }
    }

    // Create super over innings with isSuperOver: true (1 over enforced by scoring engine)
    const [superOverInnings] = await db.insert(innings).values({
      matchId: req.params.id,
      inningsNumber: existingInnings.length + 1,
      battingTeamId: req.body.battingTeamId,
      bowlingTeamId: req.body.bowlingTeamId,
      isSuperOver: true,
      status: 'in_progress',
      startedAt: new Date(),
      // Set target for 2nd innings of the super over pair
      targetScore: completedSuperOvers.length % 2 === 1
        ? completedSuperOvers[completedSuperOvers.length - 1].totalRuns + 1
        : null,
    }).returning();

    // Initialize batting scorecards for exactly 2 batsmen
    const batEntries = req.body.battingOrder.map((playerId, idx) => ({
      inningsId: superOverInnings.id,
      playerId,
      teamId: req.body.battingTeamId,
      battingPosition: idx + 1,
      didNotBat: idx >= 2,
    }));
    await db.insert(battingScorecard).values(batEntries);

    // Initialize bowling scorecard for selected bowler
    if (req.body.bowlerId) {
      await db.insert(bowlingScorecard).values({
        inningsId: superOverInnings.id,
        playerId: req.body.bowlerId,
        teamId: req.body.bowlingTeamId,
        bowlingPosition: 1,
      });
    }

    await db.update(match).set({
      status: 'super_over' as any,
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id));

    broadcast.status(req.params.id, {
      status: 'super_over',
      reason: `Super over ${Math.ceil((completedSuperOvers.length + 1) / 2)} initiated`,
    });

    return reply.status(201).send({
      innings: superOverInnings,
      maxOvers: 1,
      batsmen: req.body.battingOrder,
      bowler: req.body.bowlerId,
    });
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

  // Substitution — context.md section 5.11
  app.post<{
    Params: { id: string };
    Body: {
      teamId: string;
      playerOutId: string;
      playerInId: string;
      reason?: string;
      inningsId?: string;
    };
  }>('/:id/substitutions', { preHandler: [requireAuth] }, async (req, reply) => {
    const matchData = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchData) return reply.status(404).send({ error: 'Match not found' });

    const [sub] = await db.insert(substitution).values({
      matchId: req.params.id,
      teamId: req.body.teamId,
      playerOutId: req.body.playerOutId,
      playerInId: req.body.playerInId,
      type: req.body.reason || 'tactical',
      reason: req.body.reason || null,
    }).returning();

    // Update playing XI
    const mt = await db.query.matchTeam.findFirst({
      where: and(eq(matchTeam.matchId, req.params.id), eq(matchTeam.teamId, req.body.teamId)),
    });
    if (mt?.playingXi) {
      const newXi = mt.playingXi.map(id => id === req.body.playerOutId ? req.body.playerInId : id);
      await db.update(matchTeam).set({ playingXi: newXi })
        .where(and(eq(matchTeam.matchId, req.params.id), eq(matchTeam.teamId, req.body.teamId)));
    }

    broadcast.status(req.params.id, {
      status: 'substitution',
      reason: `Player substitution: ${req.body.reason || 'tactical'}`,
    });

    return reply.status(201).send(sub);
  });

  // Soft-delete match
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const existing = await db.query.match.findFirst({
      where: and(eq(match.id, req.params.id), eq(match.isDeleted, false)),
    });
    if (!existing) return reply.status(404).send({ error: 'Match not found' });

    const [deleted] = await db.update(match).set({
      isDeleted: true,
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(match.id, req.params.id)).returning();

    return { success: true, id: deleted.id };
  });
};
