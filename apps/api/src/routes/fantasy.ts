import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { fantasyContest, fantasyTeam, fantasyPointsLog } from '../db/schema/fantasy';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, getUserId } from '../middleware/auth';
import { scoreContest } from '../engine/fantasy-scoring';
import { appUser } from '../db/schema/user';

function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

export const fantasyRoutes: FastifyPluginAsync = async (app) => {
  // GET /contests — list contests
  app.get<{ Querystring: { page?: string; limit?: string; status?: string } }>(
    '/contests',
    async (req) => {
      const { limit, offset } = parsePagination(req.query);
      const conditions = req.query.status ? [eq(fantasyContest.status, req.query.status)] : [];

      const rows = await db
        .select()
        .from(fantasyContest)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(fantasyContest.createdAt))
        .limit(limit)
        .offset(offset);

      return { data: rows, page: Math.floor(offset / limit) + 1, limit };
    },
  );

  // POST /contests — create contest
  app.post<{
    Body: {
      name: string;
      description?: string;
      matchId?: string;
      externalMatchRef?: string;
      matchSource: string;
      entryFee?: number;
      prizePool?: any;
      maxEntries?: number;
      scoringRules: any;
      lockTime?: string;
      startsAt?: string;
    };
  }>('/contests', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { name, description, matchId, externalMatchRef, matchSource, entryFee, prizePool, maxEntries, scoringRules, lockTime, startsAt } = req.body;

    if (!name || !matchSource || !scoringRules) {
      return reply.status(400).send({ error: 'name, matchSource, and scoringRules are required' });
    }

    const [contest] = await db.insert(fantasyContest).values({
      name,
      description: description || null,
      matchId: matchId || null,
      externalMatchRef: externalMatchRef || null,
      matchSource,
      entryFee: entryFee ?? 0,
      prizePool: prizePool || null,
      maxEntries: maxEntries || null,
      scoringRules,
      lockTime: lockTime ? new Date(lockTime) : null,
      startsAt: startsAt ? new Date(startsAt) : null,
      createdBy: userId,
    }).returning();

    return reply.status(201).send(contest);
  });

  // GET /contests/:id — detail + leaderboard
  app.get<{ Params: { id: string } }>('/contests/:id', async (req, reply) => {
    const contest = await db.query.fantasyContest.findFirst({
      where: eq(fantasyContest.id, req.params.id),
    });
    if (!contest) return reply.status(404).send({ error: 'Contest not found' });

    const leaderboard = await db
      .select()
      .from(fantasyTeam)
      .where(eq(fantasyTeam.contestId, req.params.id))
      .orderBy(desc(fantasyTeam.totalPoints))
      .limit(50);

    return { contest, leaderboard };
  });

  // POST /contests/:id/team — submit fantasy team
  app.post<{
    Params: { id: string };
    Body: { teamName?: string; players: any };
  }>('/contests/:id/team', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const contest = await db.query.fantasyContest.findFirst({
      where: eq(fantasyContest.id, req.params.id),
    });
    if (!contest) return reply.status(404).send({ error: 'Contest not found' });
    if (contest.status !== 'open') return reply.status(400).send({ error: 'Contest is not open for entries' });
    if (contest.lockTime && new Date() >= contest.lockTime) {
      return reply.status(400).send({ error: 'Contest is locked' });
    }

    // Check max entries
    if (contest.maxEntries) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyTeam)
        .where(eq(fantasyTeam.contestId, req.params.id));
      if (count >= contest.maxEntries) {
        return reply.status(400).send({ error: 'Contest is full' });
      }
    }

    if (!req.body.players) return reply.status(400).send({ error: 'players is required' });

    try {
      const [team] = await db.insert(fantasyTeam).values({
        contestId: req.params.id,
        userId,
        teamName: req.body.teamName || null,
        players: req.body.players,
      }).returning();
      return reply.status(201).send(team);
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'You already have a team in this contest' });
      throw err;
    }
  });

  // PATCH /contests/:id/team — edit team before lock
  app.patch<{
    Params: { id: string };
    Body: { teamName?: string; players?: any };
  }>('/contests/:id/team', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const contest = await db.query.fantasyContest.findFirst({
      where: eq(fantasyContest.id, req.params.id),
    });
    if (!contest) return reply.status(404).send({ error: 'Contest not found' });
    if (contest.lockTime && new Date() >= contest.lockTime) {
      return reply.status(400).send({ error: 'Contest is locked, cannot edit team' });
    }

    const updates: any = {};
    if (req.body.teamName !== undefined) updates.teamName = req.body.teamName;
    if (req.body.players !== undefined) updates.players = req.body.players;

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const [updated] = await db
      .update(fantasyTeam)
      .set(updates)
      .where(and(eq(fantasyTeam.contestId, req.params.id), eq(fantasyTeam.userId, userId)))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Team not found in this contest' });
    return updated;
  });

  // GET /my-contests — user's contests
  app.get<{ Querystring: { page?: string; limit?: string } }>('/my-contests', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { limit, offset } = parsePagination(req.query);

    const rows = await db
      .select({
        teamId: fantasyTeam.id,
        teamName: fantasyTeam.teamName,
        totalPoints: fantasyTeam.totalPoints,
        rank: fantasyTeam.rank,
        contestId: fantasyContest.id,
        contestName: fantasyContest.name,
        contestStatus: fantasyContest.status,
        startsAt: fantasyContest.startsAt,
      })
      .from(fantasyTeam)
      .innerJoin(fantasyContest, eq(fantasyTeam.contestId, fantasyContest.id))
      .where(eq(fantasyTeam.userId, userId))
      .orderBy(desc(fantasyContest.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /contests/:id/leaderboard — dedicated leaderboard endpoint
  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/contests/:id/leaderboard',
    async (req, reply) => {
      const contest = await db.query.fantasyContest.findFirst({
        where: eq(fantasyContest.id, req.params.id),
      });
      if (!contest) return reply.status(404).send({ error: 'Contest not found' });

      const { limit, offset } = parsePagination(req.query);

      const rows = await db
        .select({
          teamId: fantasyTeam.id,
          userId: fantasyTeam.userId,
          teamName: fantasyTeam.teamName,
          totalPoints: fantasyTeam.totalPoints,
          rank: fantasyTeam.rank,
          displayName: appUser.displayName,
        })
        .from(fantasyTeam)
        .leftJoin(appUser, eq(fantasyTeam.userId, appUser.id))
        .where(eq(fantasyTeam.contestId, req.params.id))
        .orderBy(desc(fantasyTeam.totalPoints))
        .limit(limit)
        .offset(offset);

      return {
        contest: { id: contest.id, name: contest.name, status: contest.status },
        leaderboard: rows,
        page: Math.floor(offset / limit) + 1,
        limit,
      };
    },
  );

  // POST /contests/:id/score — trigger scoring for a contest
  app.post<{ Params: { id: string } }>(
    '/contests/:id/score',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const contest = await db.query.fantasyContest.findFirst({
        where: eq(fantasyContest.id, req.params.id),
      });
      if (!contest) return reply.status(404).send({ error: 'Contest not found' });

      await scoreContest(req.params.id);
      return { success: true };
    },
  );

  // GET /history — completed contests for user
  app.get<{ Querystring: { page?: string; limit?: string } }>('/history', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { limit, offset } = parsePagination(req.query);

    const rows = await db
      .select({
        teamId: fantasyTeam.id,
        teamName: fantasyTeam.teamName,
        totalPoints: fantasyTeam.totalPoints,
        rank: fantasyTeam.rank,
        contestId: fantasyContest.id,
        contestName: fantasyContest.name,
        contestStatus: fantasyContest.status,
      })
      .from(fantasyTeam)
      .innerJoin(fantasyContest, eq(fantasyTeam.contestId, fantasyContest.id))
      .where(and(eq(fantasyTeam.userId, userId), eq(fantasyContest.status, 'completed')))
      .orderBy(desc(fantasyContest.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });
};
