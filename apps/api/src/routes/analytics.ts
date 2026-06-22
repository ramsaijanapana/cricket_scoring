import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { delivery } from '../db/schema/index';
import { eq, and, asc, desc, isNotNull, sql } from 'drizzle-orm';

/** Cap rows returned for wagon-wheel scatter plots. */
const ANALYTICS_WAGON_WHEEL_LIMIT = 5_000;
/** Cap deliveries scanned when building worm-chart series. */
const ANALYTICS_WORM_CHART_DELIVERY_LIMIT = 10_000;
/** Cap overs returned for manhattan bar chart. */
const ANALYTICS_MANHATTAN_OVER_LIMIT = 200;
/** Cap rows returned for pitch-map scatter plots. */
const ANALYTICS_PITCH_MAP_LIMIT = 5_000;
/** Cap deliveries scanned when building partnership sequence. */
const ANALYTICS_PARTNERSHIPS_DELIVERY_LIMIT = 10_000;
/** Cap deliveries aggregated for head-to-head stats. */
const ANALYTICS_HEAD_TO_HEAD_DELIVERY_LIMIT = 50_000;
/** Cap deliveries aggregated for phase stats. */
const ANALYTICS_PHASE_STATS_DELIVERY_LIMIT = 10_000;

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
    const rows = await db
      .select({
        id: delivery.id,
        wagonX: delivery.wagonX,
        wagonY: delivery.wagonY,
        runs: delivery.runsBatsman,
        shotType: delivery.shotType,
        strikerId: delivery.strikerId,
        bowlerId: delivery.bowlerId,
        isWicket: delivery.isWicket,
      })
      .from(delivery)
      .where(
        and(
          eq(delivery.matchId, req.params.matchId),
          eq(delivery.isOverridden, false),
          isNotNull(delivery.wagonX),
          isNotNull(delivery.wagonY),
        ),
      )
      .orderBy(desc(delivery.undoStackPos))
      .limit(ANALYTICS_WAGON_WHEEL_LIMIT);

    return rows;
  });

  // Worm Chart — cumulative runs per over vs par/target
  app.get<{ Params: { matchId: string } }>('/matches/:matchId/worm-chart', async (req) => {
    const grouped = await db.execute<{
      innings_num: number;
      points: Array<{ over: number; runs: number }>;
    }>(sql`
      WITH limited_deliveries AS (
        SELECT over_num, innings_score, undo_stack_pos
        FROM delivery
        WHERE match_id = ${req.params.matchId}::uuid
          AND is_overridden = false
        ORDER BY undo_stack_pos DESC
        LIMIT ${ANALYTICS_WORM_CHART_DELIVERY_LIMIT}
      )
      SELECT
        over_num AS innings_num,
        coalesce(
          json_agg(
            json_build_object('over', over_num, 'runs', innings_score)
            ORDER BY undo_stack_pos DESC
          ),
          '[]'::json
        ) AS points
      FROM limited_deliveries
      GROUP BY over_num
    `);

    const wormData: Record<number, Array<{ over: number; runs: number }>> = {};
    for (const row of grouped) {
      wormData[row.innings_num] = row.points ?? [];
    }

    return wormData;
  });

  // Manhattan — runs per over bar chart
  app.get<{ Params: { matchId: string } }>('/matches/:matchId/manhattan', async (req) => {
    const rows = await db.execute<{ over: number; runs: number }>(sql`
      SELECT
        over_num AS over,
        SUM(total_runs)::int AS runs
      FROM delivery
      WHERE match_id = ${req.params.matchId}::uuid
        AND is_overridden = false
      GROUP BY over_num
      ORDER BY over_num
      LIMIT ${ANALYTICS_MANHATTAN_OVER_LIMIT}
    `);

    return rows;
  });

  // Pitch Map — ball landing position heat map
  app.get<{
    Params: { matchId: string };
    Querystring: { bowler_id?: string };
  }>('/matches/:matchId/pitch-map', async (req) => {
    const rows = await db
      .select({
        id: delivery.id,
        landingX: delivery.landingX,
        landingY: delivery.landingY,
        runs: delivery.runsBatsman,
        isWicket: delivery.isWicket,
        bowlerId: delivery.bowlerId,
        paceKmh: delivery.paceKmh,
        swingType: delivery.swingType,
      })
      .from(delivery)
      .where(
        and(
          eq(delivery.matchId, req.params.matchId),
          eq(delivery.isOverridden, false),
          isNotNull(delivery.landingX),
          isNotNull(delivery.landingY),
        ),
      )
      .limit(ANALYTICS_PITCH_MAP_LIMIT);

    return rows;
  });

  // Partnerships — context.md section 5.5
  app.get<{ Params: { matchId: string } }>('/matches/:matchId/partnerships', async (req) => {
    const deliveries = await db
      .select({
        inningsId: delivery.inningsId,
        strikerId: delivery.strikerId,
        nonStrikerId: delivery.nonStrikerId,
        totalRuns: delivery.totalRuns,
        isWicket: delivery.isWicket,
      })
      .from(delivery)
      .where(
        and(
          eq(delivery.matchId, req.params.matchId),
          eq(delivery.isOverridden, false),
        ),
      )
      .orderBy(asc(delivery.undoStackPos))
      .limit(ANALYTICS_PARTNERSHIPS_DELIVERY_LIMIT);

    const byInnings = new Map<string, typeof deliveries>();
    for (const d of deliveries) {
      const group = byInnings.get(d.inningsId) ?? [];
      group.push(d);
      byInnings.set(d.inningsId, group);
    }

    const partnerships: Array<{
      inningsId: string;
      batsman1Id: string;
      batsman2Id: string;
      runs: number;
      balls: number;
      isUnbroken: boolean;
    }> = [];

    for (const [inningsId, innDeliveries] of byInnings) {
      let current: {
        inningsId: string;
        batsman1Id: string;
        batsman2Id: string;
        runs: number;
        balls: number;
      } | null = null;

      for (const d of innDeliveries) {
        if (!current) {
          current = {
            inningsId,
            batsman1Id: d.strikerId,
            batsman2Id: d.nonStrikerId,
            runs: 0,
            balls: 0,
          };
        }

        current.runs += d.totalRuns;
        current.balls += 1;

        if (d.isWicket) {
          partnerships.push({ ...current, isUnbroken: false });
          current = null;
        }
      }

      if (current && current.balls > 0) {
        partnerships.push({ ...current, isUnbroken: true });
      }
    }

    return partnerships;
  });

  // Head-to-head — batsman vs bowler — context.md section 6.1
  app.get<{
    Params: { playerId: string };
    Querystring: { vs_player_id: string };
  }>('/players/:playerId/head-to-head', async (req) => {
    const [stats] = await db.execute<{
      balls: number;
      runs: number;
      dismissals: number;
      dots: number;
      boundaries: number;
    }>(sql`
      WITH limited_deliveries AS (
        SELECT runs_batsman, extra_type, is_wicket, dismissed_id
        FROM delivery
        WHERE striker_id = ${req.params.playerId}::uuid
          AND bowler_id = ${req.query.vs_player_id}::uuid
          AND is_overridden = false
        ORDER BY undo_stack_pos DESC
        LIMIT ${ANALYTICS_HEAD_TO_HEAD_DELIVERY_LIMIT}
      )
      SELECT
        COUNT(*)::int AS balls,
        COALESCE(SUM(runs_batsman), 0)::int AS runs,
        COUNT(*) FILTER (
          WHERE is_wicket AND dismissed_id = ${req.params.playerId}::uuid
        )::int AS dismissals,
        COUNT(*) FILTER (
          WHERE runs_batsman = 0 AND extra_type IS NULL
        )::int AS dots,
        COUNT(*) FILTER (WHERE runs_batsman >= 4)::int AS boundaries
      FROM limited_deliveries
    `);

    const balls = stats?.balls ?? 0;
    const runs = stats?.runs ?? 0;
    const dots = stats?.dots ?? 0;
    const boundaries = stats?.boundaries ?? 0;

    return {
      balls,
      runs,
      dismissals: stats?.dismissals ?? 0,
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

    const [stats] = await db.execute<{
      runs: number;
      wickets: number;
      balls: number;
      dots: number;
      boundaries: number;
      extras: number;
    }>(sql`
      WITH limited_deliveries AS (
        SELECT total_runs, runs_batsman, runs_extras, extra_type, is_wicket
        FROM delivery
        WHERE match_id = ${req.params.matchId}::uuid
          AND is_overridden = false
          AND over_num >= ${overRange[0]}
          AND over_num <= ${overRange[1]}
        ORDER BY undo_stack_pos DESC
        LIMIT ${ANALYTICS_PHASE_STATS_DELIVERY_LIMIT}
      )
      SELECT
        COALESCE(SUM(total_runs), 0)::int AS runs,
        COUNT(*) FILTER (WHERE is_wicket)::int AS wickets,
        COUNT(*)::int AS balls,
        COUNT(*) FILTER (
          WHERE runs_batsman = 0 AND extra_type IS NULL
        )::int AS dots,
        COUNT(*) FILTER (WHERE runs_batsman >= 4)::int AS boundaries,
        COALESCE(SUM(runs_extras), 0)::int AS extras
      FROM limited_deliveries
    `);

    const runs = stats?.runs ?? 0;
    const balls = stats?.balls ?? 0;
    const dots = stats?.dots ?? 0;
    const boundaries = stats?.boundaries ?? 0;

    return {
      runs,
      wickets: stats?.wickets ?? 0,
      runRate: balls > 0 ? (runs / (balls / 6)).toFixed(2) : '0',
      dotBallPct: balls > 0 ? ((dots / balls) * 100).toFixed(1) : '0',
      boundaryCount: boundaries,
      extras: stats?.extras ?? 0,
    };
  });
};
