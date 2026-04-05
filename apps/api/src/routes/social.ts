import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { follow, teamFollow } from '../db/schema/follow';
import { activity, feedItem } from '../db/schema/activity';
import { appUser } from '../db/schema/user';
import { trendingSnapshot } from '../db/schema/trending';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import { publishActivity } from '../services/feed-service';
import { requireAuth, getUserId } from '../middleware/auth';

function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

export const socialRoutes: FastifyPluginAsync = async (app) => {
  // POST /:id/follow — follow a user
  app.post<{ Params: { id: string } }>('/:id/follow', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const followingId = req.params.id;
    if (userId === followingId) return reply.status(400).send({ error: 'Cannot follow yourself' });

    // Verify target user exists
    const targetUser = await db.query.appUser.findFirst({ where: eq(appUser.id, followingId) });
    if (!targetUser) return reply.status(404).send({ error: 'User not found' });

    try {
      const [newFollow] = await db.insert(follow).values({
        followerId: userId,
        followingId,
      }).returning();

      // Publish follow activity to feed fan-out
      await publishActivity(userId, 'follow', 'user', followingId);

      return reply.status(201).send(newFollow);
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Already following this user' });
      throw err;
    }
  });

  // DELETE /:id/follow — unfollow a user
  app.delete<{ Params: { id: string } }>('/:id/follow', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const deleted = await db.delete(follow)
      .where(and(eq(follow.followerId, userId), eq(follow.followingId, req.params.id)))
      .returning();
    if (deleted.length === 0) return reply.status(404).send({ error: 'Follow relationship not found' });
    return reply.status(204).send();
  });

  // GET /:id/followers — paginated followers list
  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/:id/followers',
    async (req) => {
      const { limit, offset } = parsePagination(req.query);
      const rows = await db
        .select({
          id: appUser.id,
          displayName: appUser.displayName,
          avatarUrl: appUser.avatarUrl,
          followedAt: follow.createdAt,
        })
        .from(follow)
        .innerJoin(appUser, eq(follow.followerId, appUser.id))
        .where(eq(follow.followingId, req.params.id))
        .orderBy(desc(follow.createdAt))
        .limit(limit)
        .offset(offset);
      return { data: rows, page: Math.floor(offset / limit) + 1, limit };
    },
  );

  // GET /:id/following — paginated following list
  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/:id/following',
    async (req) => {
      const { limit, offset } = parsePagination(req.query);
      const rows = await db
        .select({
          id: appUser.id,
          displayName: appUser.displayName,
          avatarUrl: appUser.avatarUrl,
          followedAt: follow.createdAt,
        })
        .from(follow)
        .innerJoin(appUser, eq(follow.followingId, appUser.id))
        .where(eq(follow.followerId, req.params.id))
        .orderBy(desc(follow.createdAt))
        .limit(limit)
        .offset(offset);
      return { data: rows, page: Math.floor(offset / limit) + 1, limit };
    },
  );

  // GET /suggestions — friend suggestions (same city, mutual teams)
  app.get<{ Querystring: { page?: string; limit?: string } }>('/suggestions', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { limit, offset } = parsePagination(req.query);

    const currentUser = await db.query.appUser.findFirst({ where: eq(appUser.id, userId) });
    if (!currentUser) return reply.status(404).send({ error: 'User not found' });

    // Find users in the same city or with similar ball_type_preference, excluding already-followed users
    const conditions = [
      ne(appUser.id, userId),
      eq(appUser.isActive, true),
      eq(appUser.isPublic, true),
      sql`${appUser.id} NOT IN (SELECT ${follow.followingId} FROM follow WHERE ${follow.followerId} = ${userId})`,
    ];

    if (currentUser.city) {
      const prefs = currentUser.ballTypePreference && currentUser.ballTypePreference.length > 0
        ? currentUser.ballTypePreference
        : [];
      if (prefs.length > 0) {
        const prefsLiteral = `{${prefs.join(',')}}`;
        conditions.push(
          sql`(${appUser.city} = ${currentUser.city} OR ${appUser.ballTypePreference} && ${prefsLiteral}::text[])`,
        );
      } else {
        conditions.push(sql`${appUser.city} = ${currentUser.city}`);
      }
    }

    // Build a score-based suggestion: same city gets priority
    const suggestions = await db
      .select({
        id: appUser.id,
        displayName: appUser.displayName,
        avatarUrl: appUser.avatarUrl,
        city: appUser.city,
        primaryRole: appUser.primaryRole,
      })
      .from(appUser)
      .where(and(...conditions))
      .orderBy(
        sql`CASE WHEN ${appUser.city} = ${currentUser.city || ''} THEN 0 ELSE 1 END`,
        desc(appUser.createdAt),
      )
      .limit(limit)
      .offset(offset);

    return { data: suggestions, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /feed — personalized feed, paginated
  app.get<{ Querystring: { page?: string; limit?: string } }>('/feed', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { limit, offset } = parsePagination(req.query);

    const rows = await db
      .select({
        feedItemId: feedItem.id,
        seen: feedItem.seen,
        activityId: activity.id,
        activityType: activity.activityType,
        entityType: activity.entityType,
        entityId: activity.entityId,
        metadata: activity.metadata,
        actorId: activity.userId,
        actorName: appUser.displayName,
        actorAvatar: appUser.avatarUrl,
        createdAt: activity.createdAt,
      })
      .from(feedItem)
      .innerJoin(activity, eq(feedItem.activityId, activity.id))
      .innerJoin(appUser, eq(activity.userId, appUser.id))
      .where(eq(feedItem.userId, userId))
      .orderBy(desc(feedItem.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /feed/trending — trending by city/country
  app.get<{ Querystring: { page?: string; limit?: string; city?: string; country?: string } }>(
    '/feed/trending',
    async (req) => {
      const { limit, offset } = parsePagination(req.query);
      const { city, country } = req.query;

      const conditions = [eq(trendingSnapshot.entityType, 'activity')];
      if (city) conditions.push(eq(trendingSnapshot.city, city));
      if (country) conditions.push(eq(trendingSnapshot.country, country));

      const rows = await db
        .select()
        .from(trendingSnapshot)
        .where(and(...conditions))
        .orderBy(desc(trendingSnapshot.score))
        .limit(limit)
        .offset(offset);

      return { data: rows, page: Math.floor(offset / limit) + 1, limit };
    },
  );

  // POST /feed/:activityId/like — like an activity
  app.post<{ Params: { activityId: string } }>('/feed/:activityId/like', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const activityRecord = await db.query.activity.findFirst({
      where: eq(activity.id, req.params.activityId),
    });
    if (!activityRecord) return reply.status(404).send({ error: 'Activity not found' });

    try {
      const likeActivity = await publishActivity(userId, 'like', 'activity', req.params.activityId);
      return reply.status(201).send(likeActivity);
    } catch (err: any) {
      throw err;
    }
  });

  // DELETE /feed/:activityId/like — unlike an activity
  app.delete<{ Params: { activityId: string } }>('/feed/:activityId/like', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const deleted = await db.delete(activity)
      .where(
        and(
          eq(activity.userId, userId),
          eq(activity.activityType, 'like'),
          eq(activity.entityType, 'activity'),
          eq(activity.entityId, req.params.activityId),
        ),
      )
      .returning();
    if (deleted.length === 0) return reply.status(404).send({ error: 'Like not found' });
    return reply.status(204).send();
  });
};
