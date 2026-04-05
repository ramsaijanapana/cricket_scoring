import { db } from '../db/index';
import { trendingSnapshot } from '../db/schema/index';
import { sql } from 'drizzle-orm';
import { lt } from 'drizzle-orm';

/**
 * Compute trending snapshots for players, teams, and matches.
 * Runs periodically via cron to populate the trending_snapshot table.
 */
export async function computeTrending(): Promise<void> {
  const now = new Date();
  const period = 'weekly';

  // --- Player trending ---
  // Score batsmen by runs in last 7 days, weighted by recency (newer = higher weight)
  await db.execute(sql`
    INSERT INTO trending_snapshot (entity_type, entity_id, score, period, computed_at)
    SELECT
      'player',
      player_id,
      SUM(score) as score,
      ${period},
      NOW()
    FROM (
      SELECT
        striker_id AS player_id,
        SUM(runs_batsman * (1.0 - EXTRACT(EPOCH FROM (NOW() - d.timestamp)) / (7 * 86400))) AS score
      FROM delivery d
      WHERE d.timestamp > NOW() - INTERVAL '7 days'
        AND d.is_overridden = false
      GROUP BY striker_id
      UNION ALL
      SELECT
        bowler_id AS player_id,
        SUM(CASE WHEN d.is_wicket THEN 25 ELSE 0 END * (1.0 - EXTRACT(EPOCH FROM (NOW() - d.timestamp)) / (7 * 86400))) AS score
      FROM delivery d
      WHERE d.timestamp > NOW() - INTERVAL '7 days'
        AND d.is_overridden = false
      GROUP BY bowler_id
    ) combined
    WHERE score > 0
    GROUP BY player_id
  `);

  // --- Team trending ---
  // Score = match_count * avg total runs for the team's batting innings
  await db.execute(sql`
    INSERT INTO trending_snapshot (entity_type, entity_id, score, period, computed_at)
    SELECT
      'team',
      i.batting_team_id,
      COUNT(DISTINCT i.match_id) * COALESCE(AVG(i.total_runs), 0) AS score,
      ${period},
      NOW()
    FROM innings i
    JOIN match m ON m.id = i.match_id
    WHERE m.created_at > NOW() - INTERVAL '7 days'
    GROUP BY i.batting_team_id
    HAVING COUNT(DISTINCT i.match_id) > 0
  `);

  // --- Match trending ---
  // Live matches score higher (10x), recent completed matches get base score
  await db.execute(sql`
    INSERT INTO trending_snapshot (entity_type, entity_id, score, period, computed_at)
    SELECT
      'match',
      m.id,
      CASE
        WHEN m.status = 'live' THEN 100.0
        WHEN m.status = 'completed' THEN 10.0 * (1.0 - EXTRACT(EPOCH FROM (NOW() - m.updated_at)) / (7 * 86400))
        ELSE 1.0
      END AS score,
      ${period},
      NOW()
    FROM match m
    WHERE m.created_at > NOW() - INTERVAL '7 days'
      OR m.status = 'live'
  `);

  // --- Cleanup old snapshots > 30 days ---
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  await db.delete(trendingSnapshot).where(lt(trendingSnapshot.computedAt, cutoff));
}
