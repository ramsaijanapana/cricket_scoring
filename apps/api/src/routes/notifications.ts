import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { notification } from '../db/schema/notification';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, getUserId } from '../middleware/auth';

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
};
