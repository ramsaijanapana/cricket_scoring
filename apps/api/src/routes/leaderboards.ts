import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { battingScorecard, bowlingScorecard } from '../db/schema/scorecard';
import { innings } from '../db/schema/innings';
import { match } from '../db/schema/match';
import { player } from '../db/schema/player';
import { appUser } from '../db/schema/user';
import { fantasyTeam, fantasyContest } from '../db/schema/fantasy';
import { userAchievement, achievement } from '../db/schema/achievement';
import { eq, and, sql, gte } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';

function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function periodToDate(period?: string): Date | null {
  if (!period) return null;
  const now = new Date();
  switch (period) {
    case 'week': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'year': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default: return null;
  }
}

type LeaderboardQuery = {
  page?: string;
  limit?: string;
  city?: string;
  country?: string;
  format?: string;
  ball_type?: string;
  period?: string;
};

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  // GET /batting — batting leaderboard
  app.get<{ Querystring: LeaderboardQuery }>('/batting', async (req) => {
    const { limit, offset } = parsePagination(req.query);
    const { city, country, ball_type, period } = req.query;
    const periodDate = periodToDate(period);

    const conditions: any[] = [];
    if (city) conditions.push(eq(match.city, city));
    if (country) conditions.push(eq(match.country, country));
    if (ball_type) conditions.push(eq(match.ballType, ball_type));
    if (periodDate) conditions.push(gte(match.createdAt, periodDate));

    const rows = await db
      .select({
        playerId: battingScorecard.playerId,
        playerFirstName: player.firstName,
        playerLastName: player.lastName,
        totalRuns: sql<number>`sum(${battingScorecard.runsScored})::int`,
        totalBalls: sql<number>`sum(${battingScorecard.ballsFaced})::int`,
        innings: sql<number>`count(*)::int`,
        average: sql<number>`round(avg(${battingScorecard.runsScored})::numeric, 2)`,
        strikeRate: sql<number>`round((sum(${battingScorecard.runsScored})::float / NULLIF(sum(${battingScorecard.ballsFaced}), 0) * 100)::numeric, 2)`,
      })
      .from(battingScorecard)
      .innerJoin(player, eq(battingScorecard.playerId, player.id))
      .innerJoin(innings, eq(battingScorecard.inningsId, innings.id))
      .innerJoin(match, eq(innings.matchId, match.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(battingScorecard.playerId, player.firstName, player.lastName)
      .orderBy(sql`sum(${battingScorecard.runsScored}) DESC`)
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /bowling — bowling leaderboard
  app.get<{ Querystring: LeaderboardQuery }>('/bowling', async (req) => {
    const { limit, offset } = parsePagination(req.query);
    const { city, country, ball_type, period } = req.query;
    const periodDate = periodToDate(period);

    const conditions: any[] = [];
    if (city) conditions.push(eq(match.city, city));
    if (country) conditions.push(eq(match.country, country));
    if (ball_type) conditions.push(eq(match.ballType, ball_type));
    if (periodDate) conditions.push(gte(match.createdAt, periodDate));

    const rows = await db
      .select({
        playerId: bowlingScorecard.playerId,
        playerFirstName: player.firstName,
        playerLastName: player.lastName,
        totalWickets: sql<number>`sum(${bowlingScorecard.wicketsTaken})::int`,
        totalRunsConceded: sql<number>`sum(${bowlingScorecard.runsConceded})::int`,
        totalOvers: sql<number>`sum(${bowlingScorecard.oversBowled}::float)`,
        innings: sql<number>`count(*)::int`,
        economy: sql<number>`round((sum(${bowlingScorecard.runsConceded})::float / NULLIF(sum(${bowlingScorecard.oversBowled}::float), 0))::numeric, 2)`,
        average: sql<number>`round((sum(${bowlingScorecard.runsConceded})::float / NULLIF(sum(${bowlingScorecard.wicketsTaken}), 0))::numeric, 2)`,
      })
      .from(bowlingScorecard)
      .innerJoin(player, eq(bowlingScorecard.playerId, player.id))
      .innerJoin(innings, eq(bowlingScorecard.inningsId, innings.id))
      .innerJoin(match, eq(innings.matchId, match.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(bowlingScorecard.playerId, player.firstName, player.lastName)
      .orderBy(sql`sum(${bowlingScorecard.wicketsTaken}) DESC`)
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /xp — XP leaderboard based on achievements
  app.get<{ Querystring: LeaderboardQuery }>('/xp', async (req) => {
    const { limit, offset } = parsePagination(req.query);

    const rows = await db
      .select({
        userId: userAchievement.userId,
        displayName: appUser.displayName,
        avatarUrl: appUser.avatarUrl,
        totalXp: sql<number>`sum(${achievement.xpReward})::int`,
        achievementCount: sql<number>`count(*)::int`,
      })
      .from(userAchievement)
      .innerJoin(achievement, eq(userAchievement.achievementId, achievement.id))
      .innerJoin(appUser, eq(userAchievement.userId, appUser.id))
      .groupBy(userAchievement.userId, appUser.displayName, appUser.avatarUrl)
      .orderBy(sql`sum(${achievement.xpReward}) DESC`)
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /fantasy — fantasy leaderboard
  app.get<{ Querystring: LeaderboardQuery }>('/fantasy', async (req) => {
    const { limit, offset } = parsePagination(req.query);

    const rows = await db
      .select({
        userId: fantasyTeam.userId,
        displayName: appUser.displayName,
        avatarUrl: appUser.avatarUrl,
        totalPoints: sql<number>`sum(${fantasyTeam.totalPoints})::int`,
        contestsPlayed: sql<number>`count(*)::int`,
      })
      .from(fantasyTeam)
      .innerJoin(appUser, eq(fantasyTeam.userId, appUser.id))
      .innerJoin(fantasyContest, eq(fantasyTeam.contestId, fantasyContest.id))
      .where(eq(fantasyContest.status, 'completed'))
      .groupBy(fantasyTeam.userId, appUser.displayName, appUser.avatarUrl)
      .orderBy(sql`sum(${fantasyTeam.totalPoints}) DESC`)
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /me — user's own ranks across leaderboards
  app.get('/me', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    // Get user's batting rank
    const battingRank = await db.execute(sql`
      SELECT rank FROM (
        SELECT bs.player_id, RANK() OVER (ORDER BY sum(bs.runs_scored) DESC) as rank
        FROM batting_scorecard bs
        GROUP BY bs.player_id
      ) ranked
      INNER JOIN app_user au ON au.player_id = ranked.player_id
      WHERE au.id = ${userId}
    `);

    // Get user's XP rank
    const xpRank = await db.execute(sql`
      SELECT rank FROM (
        SELECT ua.user_id, RANK() OVER (ORDER BY sum(a.xp_reward) DESC) as rank
        FROM user_achievement ua
        INNER JOIN achievement a ON ua.achievement_id = a.id
        GROUP BY ua.user_id
      ) ranked
      WHERE ranked.user_id = ${userId}
    `);

    // Get user's fantasy rank
    const fantasyRank = await db.execute(sql`
      SELECT rank FROM (
        SELECT ft.user_id, RANK() OVER (ORDER BY sum(ft.total_points) DESC) as rank
        FROM fantasy_team ft
        INNER JOIN fantasy_contest fc ON ft.contest_id = fc.id
        WHERE fc.status = 'completed'
        GROUP BY ft.user_id
      ) ranked
      WHERE ranked.user_id = ${userId}
    `);

    return {
      batting: battingRank[0]?.rank ?? null,
      xp: xpRank[0]?.rank ?? null,
      fantasy: fantasyRank[0]?.rank ?? null,
    };
  });
};
