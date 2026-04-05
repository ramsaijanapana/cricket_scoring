import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { commentary } from '../db/schema/index';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';

/**
 * Commentary routes — context.md section 6.1
 *
 * GET    /api/matches/:id/commentary            — commentary feed (paginated, with ?lang=)
 * GET    /api/matches/:id/commentary/:ballId     — single ball commentary
 * PATCH  /api/matches/:id/commentary/:id         — manually edit commentary
 */
export const commentaryRoutes: FastifyPluginAsync = async (app) => {
  // Commentary feed (paginated)
  app.get<{
    Params: { id: string };
    Querystring: { lang?: string; page?: string; limit?: string };
  }>('/:id/commentary', async (req) => {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    const results = await db.query.commentary.findMany({
      where: eq(commentary.matchId, req.params.id),
      orderBy: [desc(commentary.publishedAt)],
      limit,
      offset,
    });

    return {
      data: results,
      page,
      limit,
      hasMore: results.length === limit,
    };
  });

  // Single ball commentary
  app.get<{ Params: { id: string; commentaryId: string } }>(
    '/:id/commentary/:commentaryId',
    async (req, reply) => {
      const result = await db.query.commentary.findFirst({
        where: eq(commentary.id, req.params.commentaryId),
      });
      if (!result) return reply.status(404).send({ error: 'Commentary not found' });
      return result;
    },
  );

  // Edit commentary (manual mode) — context.md section 7.2
  app.patch<{
    Params: { id: string; commentaryId: string };
    Body: { text?: string; text_short?: string; mode?: string };
  }>('/:id/commentary/:commentaryId', { preHandler: [requireAuth] }, async (req, reply) => {
    const updates: Record<string, any> = {};
    if (req.body.text) updates.text = req.body.text;
    if (req.body.text_short) updates.textShort = req.body.text_short;
    if (req.body.mode) updates.mode = req.body.mode;

    const [updated] = await db.update(commentary).set(updates)
      .where(eq(commentary.id, req.params.commentaryId)).returning();

    if (!updated) return reply.status(404).send({ error: 'Commentary not found' });
    return updated;
  });
};
