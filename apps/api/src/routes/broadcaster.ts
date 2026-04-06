/**
 * Broadcaster API — public API for TV broadcasters and overlay systems.
 *
 * Provides:
 * - SSE (Server-Sent Events) feed for real-time match events
 * - Overlay data endpoint for TV graphics
 * - Full scorecard in broadcaster-friendly format
 *
 * All endpoints require API key authentication via x-api-key header.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index';
import { delivery, innings, match, matchTeam, battingScorecard, bowlingScorecard } from '../db/schema/index';
import { matchFormatConfig } from '../db/schema/match-format';
import { team } from '../db/schema/team';
import { player } from '../db/schema/player';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { getIO } from '../services/realtime';

// ---------------------------------------------------------------------------
// API Key Authentication
// ---------------------------------------------------------------------------

const BROADCASTER_API_KEY = process.env.BROADCASTER_API_KEY || '';

async function authenticateBroadcaster(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!BROADCASTER_API_KEY) {
    return reply.status(503).send({ error: 'Broadcaster API not configured' });
  }

  if (!apiKey || apiKey !== BROADCASTER_API_KEY) {
    return reply.status(401).send({ error: 'Invalid or missing API key' });
  }
}

// ---------------------------------------------------------------------------
// Route Plugin
// ---------------------------------------------------------------------------

export const broadcasterRoutes: FastifyPluginAsync = async (app) => {
  // Apply API key auth to all routes in this plugin
  app.addHook('onRequest', authenticateBroadcaster);

  /**
   * GET /api/v1/broadcaster/matches/:id/feed
   *
   * Server-Sent Events stream for real-time match events.
   * Event types: delivery, wicket, over_complete, milestone, innings_complete, match_complete
   */
  app.get<{ Params: { id: string } }>('/matches/:id/feed', async (req, reply) => {
    const matchId = req.params.id;

    // Verify match exists
    const [matchRow] = await db
      .select({ id: match.id, status: match.status })
      .from(match)
      .where(eq(match.id, matchId))
      .limit(1);

    if (!matchRow) {
      return reply.status(404).send({ error: 'Match not found' });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ matchId, status: matchRow.status })}\n\n`);

    // Keep-alive heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      reply.raw.write(`:heartbeat\n\n`);
    }, 15_000);

    // Listen to Socket.IO events for this match and forward as SSE
    const io = getIO();

    const eventTypes = [
      'delivery',
      'wicket',
      'over',
      'milestone',
      'status',
    ] as const;

    const listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

    for (const eventType of eventTypes) {
      const socketEvent = `match:${matchId}:${eventType}`;

      const handler = (data: any) => {
        // Map Socket.IO event types to broadcaster event types
        let sseEventType = eventType;
        if (eventType === 'over') sseEventType = 'over_complete';
        if (eventType === 'status') {
          // Determine if it's innings_complete or match_complete
          if (data?.status === 'completed') sseEventType = 'match_complete';
          else if (data?.inningsComplete) sseEventType = 'innings_complete';
        }

        // Enrich with context
        const enrichedData = {
          type: sseEventType,
          matchId,
          timestamp: new Date().toISOString(),
          ...data,
        };

        reply.raw.write(`event: ${sseEventType}\ndata: ${JSON.stringify(enrichedData)}\n\n`);
      };

      // Listen on the server-side Socket.IO for internal events
      // We use the io.sockets adapter to intercept room broadcasts
      io.on(socketEvent, handler);
      listeners.push({ event: socketEvent, handler });
    }

    // Cleanup on disconnect
    const cleanup = () => {
      clearInterval(heartbeat);
      for (const { event, handler } of listeners) {
        io.removeListener(event, handler);
      }
    };

    req.raw.on('close', cleanup);
    req.raw.on('aborted', cleanup);

    // Prevent Fastify from closing the response
    return reply;
  });

  /**
   * GET /api/v1/broadcaster/matches/:id/overlay
   *
   * Current match state formatted for TV overlay graphics.
   */
  app.get<{ Params: { id: string } }>('/matches/:id/overlay', async (req) => {
    const matchId = req.params.id;

    // Fetch match with teams
    const [matchRow] = await db
      .select()
      .from(match)
      .where(eq(match.id, matchId))
      .limit(1);

    if (!matchRow) {
      return { error: 'Match not found' };
    }

    // Fetch teams
    const teams = await db
      .select({
        designation: matchTeam.designation,
        teamId: matchTeam.teamId,
        teamName: team.name,
        playingXi: matchTeam.playingXi,
      })
      .from(matchTeam)
      .innerJoin(team, eq(matchTeam.teamId, team.id))
      .where(eq(matchTeam.matchId, matchId));

    // Fetch all innings
    const allInnings = await db
      .select()
      .from(innings)
      .where(eq(innings.matchId, matchId))
      .orderBy(asc(innings.inningsNumber));

    const currentInnings = allInnings.find((i) => i.status === 'in_progress') || allInnings[allInnings.length - 1];

    // Fetch format config for overs info
    const [formatConfig] = await db
      .select()
      .from(matchFormatConfig)
      .where(eq(matchFormatConfig.id, matchRow.formatConfigId))
      .limit(1);

    // Current batsmen and bowler from latest deliveries
    let currentBatsmen: Array<{ playerId: string; name: string; runs: number; balls: number }> = [];
    let currentBowler: { playerId: string; name: string; overs: string; runs: number; wickets: number } | null = null;

    if (currentInnings) {
      // Get the last delivery to find current batsmen and bowler
      const [lastDelivery] = await db
        .select()
        .from(delivery)
        .where(
          and(
            eq(delivery.inningsId, currentInnings.id),
            eq(delivery.isOverridden, false),
          ),
        )
        .orderBy(desc(delivery.undoStackPos))
        .limit(1);

      if (lastDelivery) {
        // Fetch current batsmen scorecards
        const batsmen = await db
          .select({
            playerId: battingScorecard.playerId,
            firstName: player.firstName,
            lastName: player.lastName,
            runs: battingScorecard.runsScored,
            balls: battingScorecard.ballsFaced,
          })
          .from(battingScorecard)
          .innerJoin(player, eq(battingScorecard.playerId, player.id))
          .where(
            and(
              eq(battingScorecard.inningsId, currentInnings.id),
              sql`${battingScorecard.playerId} IN (${lastDelivery.strikerId}, ${lastDelivery.nonStrikerId})`,
            ),
          );

        currentBatsmen = batsmen.map((b) => ({
          playerId: b.playerId,
          name: `${b.firstName} ${b.lastName}`,
          runs: b.runs,
          balls: b.balls,
        }));

        // Fetch current bowler scorecard
        const [bowler] = await db
          .select({
            playerId: bowlingScorecard.playerId,
            firstName: player.firstName,
            lastName: player.lastName,
            overs: bowlingScorecard.oversBowled,
            runs: bowlingScorecard.runsConceded,
            wickets: bowlingScorecard.wicketsTaken,
          })
          .from(bowlingScorecard)
          .innerJoin(player, eq(bowlingScorecard.playerId, player.id))
          .where(
            and(
              eq(bowlingScorecard.inningsId, currentInnings.id),
              eq(bowlingScorecard.playerId, lastDelivery.bowlerId),
            ),
          )
          .limit(1);

        if (bowler) {
          currentBowler = {
            playerId: bowler.playerId,
            name: `${bowler.firstName} ${bowler.lastName}`,
            overs: bowler.overs,
            runs: bowler.runs,
            wickets: bowler.wickets,
          };
        }
      }
    }

    // Calculate run rate and required rate
    const currentRR = currentInnings
      ? calculateRunRate(currentInnings.totalRuns, currentInnings.totalOvers)
      : 0;

    let requiredRate: number | null = null;
    if (currentInnings?.targetScore && formatConfig?.oversPerInnings) {
      const ballsBowled = oversToBalls(currentInnings.totalOvers);
      const totalBalls = formatConfig.oversPerInnings * 6;
      const ballsRemaining = totalBalls - ballsBowled;
      const runsNeeded = currentInnings.targetScore - currentInnings.totalRuns;
      if (ballsRemaining > 0) {
        requiredRate = Math.round(((runsNeeded / ballsRemaining) * 6) * 100) / 100;
      }
    }

    return {
      matchId,
      status: matchRow.status,
      venue: matchRow.venue,
      teams: teams.map((t) => ({
        designation: t.designation,
        name: t.teamName,
        teamId: t.teamId,
      })),
      innings: allInnings.map((i) => ({
        inningsNumber: i.inningsNumber,
        battingTeamId: i.battingTeamId,
        runs: i.totalRuns,
        wickets: i.totalWickets,
        overs: i.totalOvers,
        status: i.status,
        target: i.targetScore,
      })),
      currentInnings: currentInnings
        ? {
            inningsNumber: currentInnings.inningsNumber,
            battingTeamId: currentInnings.battingTeamId,
            runs: currentInnings.totalRuns,
            wickets: currentInnings.totalWickets,
            overs: currentInnings.totalOvers,
            runRate: currentRR,
            requiredRate,
          }
        : null,
      currentBatsmen,
      currentBowler,
      format: formatConfig
        ? {
            name: formatConfig.name,
            oversPerInnings: formatConfig.oversPerInnings,
          }
        : null,
    };
  });

  /**
   * GET /api/v1/broadcaster/matches/:id/scorecard
   *
   * Full scorecard in broadcaster-friendly format.
   */
  app.get<{ Params: { id: string } }>('/matches/:id/scorecard', async (req) => {
    const matchId = req.params.id;

    // Fetch match
    const [matchRow] = await db
      .select()
      .from(match)
      .where(eq(match.id, matchId))
      .limit(1);

    if (!matchRow) {
      return { error: 'Match not found' };
    }

    // Fetch teams
    const teams = await db
      .select({
        designation: matchTeam.designation,
        teamId: matchTeam.teamId,
        teamName: team.name,
      })
      .from(matchTeam)
      .innerJoin(team, eq(matchTeam.teamId, team.id))
      .where(eq(matchTeam.matchId, matchId));

    // Fetch all innings
    const allInnings = await db
      .select()
      .from(innings)
      .where(eq(innings.matchId, matchId))
      .orderBy(asc(innings.inningsNumber));

    // For each innings, fetch batting and bowling scorecards
    const inningsData = await Promise.all(
      allInnings.map(async (inn) => {
        const batting = await db
          .select({
            playerId: battingScorecard.playerId,
            firstName: player.firstName,
            lastName: player.lastName,
            battingPosition: battingScorecard.battingPosition,
            runs: battingScorecard.runsScored,
            balls: battingScorecard.ballsFaced,
            fours: battingScorecard.fours,
            sixes: battingScorecard.sixes,
            strikeRate: battingScorecard.strikeRate,
            isOut: battingScorecard.isOut,
            dismissalType: battingScorecard.dismissalType,
            dismissalText: battingScorecard.dismissalText,
            didNotBat: battingScorecard.didNotBat,
          })
          .from(battingScorecard)
          .innerJoin(player, eq(battingScorecard.playerId, player.id))
          .where(eq(battingScorecard.inningsId, inn.id))
          .orderBy(asc(battingScorecard.battingPosition));

        const bowling = await db
          .select({
            playerId: bowlingScorecard.playerId,
            firstName: player.firstName,
            lastName: player.lastName,
            overs: bowlingScorecard.oversBowled,
            maidens: bowlingScorecard.maidens,
            runs: bowlingScorecard.runsConceded,
            wickets: bowlingScorecard.wicketsTaken,
            economy: bowlingScorecard.economyRate,
            wides: bowlingScorecard.wides,
            noBalls: bowlingScorecard.noBalls,
          })
          .from(bowlingScorecard)
          .innerJoin(player, eq(bowlingScorecard.playerId, player.id))
          .where(eq(bowlingScorecard.inningsId, inn.id))
          .orderBy(asc(bowlingScorecard.bowlingPosition));

        return {
          inningsNumber: inn.inningsNumber,
          battingTeamId: inn.battingTeamId,
          bowlingTeamId: inn.bowlingTeamId,
          totalRuns: inn.totalRuns,
          totalWickets: inn.totalWickets,
          totalOvers: inn.totalOvers,
          totalExtras: inn.totalExtras,
          status: inn.status,
          declared: inn.declared,
          allOut: inn.allOut,
          batting: batting.map((b) => ({
            player: `${b.firstName} ${b.lastName}`,
            playerId: b.playerId,
            position: b.battingPosition,
            runs: b.runs,
            balls: b.balls,
            fours: b.fours,
            sixes: b.sixes,
            strikeRate: b.strikeRate,
            isOut: b.isOut,
            dismissal: b.dismissalText || (b.didNotBat ? 'DNB' : b.isOut ? b.dismissalType : 'not out'),
          })),
          bowling: bowling.map((b) => ({
            player: `${b.firstName} ${b.lastName}`,
            playerId: b.playerId,
            overs: b.overs,
            maidens: b.maidens,
            runs: b.runs,
            wickets: b.wickets,
            economy: b.economy,
            wides: b.wides,
            noBalls: b.noBalls,
          })),
        };
      }),
    );

    return {
      matchId,
      status: matchRow.status,
      venue: matchRow.venue,
      result: matchRow.resultSummary,
      teams: teams.map((t) => ({
        designation: t.designation,
        name: t.teamName,
        teamId: t.teamId,
      })),
      innings: inningsData,
    };
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function oversToBalls(overs: string): number {
  const o = parseFloat(overs);
  const whole = Math.floor(o);
  const balls = Math.round((o - whole) * 10);
  return whole * 6 + balls;
}

function calculateRunRate(runs: number, overs: string): number {
  const balls = oversToBalls(overs);
  if (balls <= 0) return 0;
  return Math.round(((runs / balls) * 6) * 100) / 100;
}
