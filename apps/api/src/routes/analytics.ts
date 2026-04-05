import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { delivery } from '../db/schema/index';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Analytics routes — context.md section 6.1
 *
 * Provides data for: wagon wheel, worm chart, Manhattan, pitch map,
 * partnerships, head-to-head, phase stats.
 *
 * NOTE: context.md section 13 requires ClickHouse for analytics queries.
 * This initial implementation uses PostgreSQL. Migration to ClickHouse is
 * planned for Phase 2 when data volume requires OLAP performance.
 */
export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // Wagon Wheel — context.md section 7.3
  app.get<{
    Params: { matchId: string };
    Querystring: { innings?: string; player_id?: string };
  }>('/matches/:matchId/wagon-wheel', async (req) => {
    const conditions = [
      eq(delivery.matchId, req.params.matchId),
      eq(delivery.isOverridden, false),
    ];

    const deliveries = await db.query.delivery.findMany({
      where: and(...conditions),
      orderBy: [desc(delivery.undoStackPos)],
    });

    // Filter for shots with wagon wheel data
    return deliveries
      .filter(d => d.wagonX !== null && d.wagonY !== null)
      .map(d => ({
        id: d.id,
        wagonX: d.wagonX,
        wagonY: d.wagonY,
        runs: d.runsBatsman,
        shotType: d.shotType,
        strikerId: d.strikerId,
        bowlerId: d.bowlerId,
        isWicket: d.isWicket,
      }));
  });

  // Worm Chart — cumulative runs per over vs par/target
  app.get<{ Params: { matchId: string } }>('/matches/:matchId/worm-chart', async (req) => {
    const deliveries = await db.query.delivery.findMany({
      where: and(
        eq(delivery.matchId, req.params.matchId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
    });

    // Group by innings and over, accumulate runs
    const wormData: Record<number, Array<{ over: number; runs: number }>> = {};

    for (const d of deliveries) {
      const inningsNum = d.overNum; // simplified; should use innings number
      if (!wormData[inningsNum]) wormData[inningsNum] = [];

      wormData[inningsNum].push({
        over: d.overNum,
        runs: d.inningsScore,
      });
    }

    return wormData;
  });

  // Manhattan — runs per over bar chart
  app.get<{ Params: { matchId: string } }>('/matches/:matchId/manhattan', async (req) => {
    const deliveries = await db.query.delivery.findMany({
      where: and(
        eq(delivery.matchId, req.params.matchId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
    });

    // Group by over, sum runs per over
    const overRuns: Record<number, number> = {};
    for (const d of deliveries) {
      overRuns[d.overNum] = (overRuns[d.overNum] || 0) + d.totalRuns;
    }

    return Object.entries(overRuns).map(([over, runs]) => ({
      over: parseInt(over),
      runs,
    }));
  });

  // Pitch Map — ball landing position heat map
  app.get<{
    Params: { matchId: string };
    Querystring: { bowler_id?: string };
  }>('/matches/:matchId/pitch-map', async (req) => {
    const conditions = [
      eq(delivery.matchId, req.params.matchId),
      eq(delivery.isOverridden, false),
    ];

    const deliveries = await db.query.delivery.findMany({
      where: and(...conditions),
    });

    return deliveries
      .filter(d => d.landingX !== null && d.landingY !== null)
      .map(d => ({
        id: d.id,
        landingX: d.landingX,
        landingY: d.landingY,
        runs: d.runsBatsman,
        isWicket: d.isWicket,
        bowlerId: d.bowlerId,
        paceKmh: d.paceKmh,
        swingType: d.swingType,
      }));
  });

  // Partnerships — context.md section 5.5
  app.get<{ Params: { matchId: string } }>('/matches/:matchId/partnerships', async (req) => {
    const deliveries = await db.query.delivery.findMany({
      where: and(
        eq(delivery.matchId, req.params.matchId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
    });

    // Build partnerships from delivery sequence
    const partnerships: Array<{
      batsman1Id: string;
      batsman2Id: string;
      runs: number;
      balls: number;
      startWicket: number;
    }> = [];

    let currentPartnership = {
      batsman1Id: '',
      batsman2Id: '',
      runs: 0,
      balls: 0,
      startWicket: 0,
    };

    for (const d of deliveries) {
      if (currentPartnership.batsman1Id !== d.strikerId && currentPartnership.batsman2Id !== d.strikerId) {
        // New partnership
        if (currentPartnership.balls > 0) partnerships.push({ ...currentPartnership });
        currentPartnership = {
          batsman1Id: d.strikerId,
          batsman2Id: d.nonStrikerId,
          runs: d.totalRuns,
          balls: 1,
          startWicket: d.inningsWickets,
        };
      } else {
        currentPartnership.runs += d.totalRuns;
        currentPartnership.balls += 1;
      }
    }
    if (currentPartnership.balls > 0) partnerships.push(currentPartnership);

    return partnerships;
  });

  // Head-to-head — batsman vs bowler — context.md section 6.1
  app.get<{
    Params: { playerId: string };
    Querystring: { vs_player_id: string };
  }>('/players/:playerId/head-to-head', async (req) => {
    const deliveries = await db.query.delivery.findMany({
      where: and(
        eq(delivery.strikerId, req.params.playerId),
        eq(delivery.bowlerId, req.query.vs_player_id),
        eq(delivery.isOverridden, false),
      ),
    });

    const balls = deliveries.length;
    const runs = deliveries.reduce((sum, d) => sum + d.runsBatsman, 0);
    const dismissals = deliveries.filter(d => d.isWicket && d.dismissedId === req.params.playerId).length;
    const dots = deliveries.filter(d => d.runsBatsman === 0 && !d.extraType).length;
    const boundaries = deliveries.filter(d => d.runsBatsman >= 4).length;

    return {
      balls,
      runs,
      dismissals,
      dotBallPct: balls > 0 ? (dots / balls) * 100 : 0,
      boundaryPct: balls > 0 ? (boundaries / balls) * 100 : 0,
      avgRunsPerBall: balls > 0 ? runs / balls : 0,
    };
  });

  // Phase stats — context.md section 6.1
  app.get<{
    Params: { matchId: string };
    Querystring: { phase: string }; // 'powerplay' | 'middle' | 'death'
  }>('/matches/:matchId/phase-stats', async (req) => {
    const phase = req.query.phase;
    let overRange: [number, number];

    // Default T20 phases (should be configurable per format)
    switch (phase) {
      case 'powerplay': overRange = [0, 5]; break;
      case 'middle': overRange = [6, 14]; break;
      case 'death': overRange = [15, 19]; break;
      default: overRange = [0, 99];
    }

    const deliveries = await db.query.delivery.findMany({
      where: and(
        eq(delivery.matchId, req.params.matchId),
        eq(delivery.isOverridden, false),
      ),
    });

    const phaseDeliveries = deliveries.filter(
      d => d.overNum >= overRange[0] && d.overNum <= overRange[1],
    );

    const runs = phaseDeliveries.reduce((sum, d) => sum + d.totalRuns, 0);
    const wickets = phaseDeliveries.filter(d => d.isWicket).length;
    const balls = phaseDeliveries.length;
    const dots = phaseDeliveries.filter(d => d.runsBatsman === 0 && !d.extraType).length;
    const boundaries = phaseDeliveries.filter(d => d.runsBatsman >= 4).length;
    const extras = phaseDeliveries.reduce((sum, d) => sum + d.runsExtras, 0);

    return {
      runs,
      wickets,
      runRate: balls > 0 ? (runs / (balls / 6)).toFixed(2) : '0',
      dotBallPct: balls > 0 ? ((dots / balls) * 100).toFixed(1) : '0',
      boundaryCount: boundaries,
      extras,
    };
  });
};
