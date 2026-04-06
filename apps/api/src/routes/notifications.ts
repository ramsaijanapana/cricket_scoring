import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { notification } from '../db/schema/notification';
import { notificationPreference } from '../db/schema/notification-preference';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, getUserId } from '../middleware/auth';
import { registerDeviceToken, unregisterDeviceToken } from '../services/push-service';

function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // GET / — list notifications, paginated
  app.get<{ Querystring: { page?: string; limit?: string } }>('/', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { limit, offset } = parsePagination(req.query);

    const rows = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, userId))
      .orderBy(desc(notification.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // PATCH /:id/read — mark single notification as read
  app.patch<{ Params: { id: string } }>('/:id/read', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const [updated] = await db
      .update(notification)
      .set({ read: true })
      .where(and(eq(notification.id, req.params.id), eq(notification.userId, userId)))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Notification not found' });
    return updated;
  });

  // POST /read-all — mark all notifications as read
  app.post('/read-all', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    await db
      .update(notification)
      .set({ read: true })
      .where(and(eq(notification.userId, userId), eq(notification.read, false)));

    return { success: true };
  });

  // GET /unread-count
  app.get('/unread-count', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notification)
      .where(and(eq(notification.userId, userId), eq(notification.read, false)));

    return { count: result[0]?.count ?? 0 };
  });

  // POST /register-device — register FCM device token
  app.post<{
    Body: { token: string; platform?: string };
  }>('/register-device', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { token, platform } = req.body;
    if (!token) return reply.status(400).send({ error: 'Device token is required' });

    await registerDeviceToken(userId, token, platform || 'web');
    return { success: true };
  });

  // DELETE /unregister-device — remove FCM device token
  app.post<{
    Body: { token: string };
  }>('/unregister-device', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { token } = req.body;
    if (!token) return reply.status(400).send({ error: 'Device token is required' });

    const removed = await unregisterDeviceToken(userId, token);
    if (!removed) return reply.status(404).send({ error: 'Token not found' });
    return { success: true };
  });

  // POST /preferences — set notification preferences (upsert)
  app.post<{
    Body: {
      milestones?: boolean;
      wickets?: boolean;
      matchCompletion?: boolean;
      followActivity?: boolean;
      chatMessages?: boolean;
      pushEnabled?: boolean;
    };
  }>('/preferences', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const existing = await db.query.notificationPreference.findFirst({
      where: eq(notificationPreference.userId, userId),
    });

    const values = {
      milestones: req.body.milestones,
      wickets: req.body.wickets,
      matchCompletion: req.body.matchCompletion,
      followActivity: req.body.followActivity,
      chatMessages: req.body.chatMessages,
      pushEnabled: req.body.pushEnabled,
    };

    // Remove undefined keys
    const cleanValues = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined),
    );

    if (existing) {
      const [updated] = await db
        .update(notificationPreference)
        .set({ ...cleanValues, updatedAt: new Date() })
        .where(eq(notificationPreference.userId, userId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(notificationPreference)
      .values({ userId, ...cleanValues })
      .returning();
    return reply.status(201).send(created);
  });

  // GET /preferences — get notification preferences
  app.get('/preferences', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const pref = await db.query.notificationPreference.findFirst({
      where: eq(notificationPreference.userId, userId),
    });

    // Return defaults if no preferences set
    return pref || {
      milestones: true,
      wickets: true,
      matchCompletion: true,
      followActivity: true,
      chatMessages: true,
      pushEnabled: true,
    };
  });
};
