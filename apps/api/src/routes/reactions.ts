import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { reaction } from '../db/schema/reaction';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, getUserId } from '../middleware/auth';
import { getIO } from '../services/realtime';

const ALLOWED_EMOJIS = ['\uD83D\uDD25', '\uD83C\uDFAF', '\uD83D\uDC4F', '\uD83D\uDE31', '\uD83D\uDCAA'];

/**
 * Emoji Reaction routes — mounted under /api/v1/matches
 *
 * POST /:id/reactions — submit an emoji reaction to a delivery
 *   Rate limit: 1 reaction per delivery per user (enforced by unique constraint)
 */
export const reactionRoutes: FastifyPluginAsync = async (app) => {
  // POST /:id/reactions — submit emoji reaction
  app.post<{
    Params: { id: string };
    Body: { deliveryId: string; emoji: string };
  }>('/:id/reactions', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { deliveryId, emoji } = req.body;
    if (!deliveryId || !emoji) {
      return reply.status(400).send({ error: 'deliveryId and emoji are required' });
    }

    if (!ALLOWED_EMOJIS.includes(emoji)) {
      return reply.status(400).send({ error: 'Invalid emoji. Allowed: fire, target, clap, scream, flex' });
    }

    try {
      const [created] = await db.insert(reaction).values({
        matchId: req.params.id,
        deliveryId,
        userId,
        emoji,
      }).returning();

      // Broadcast reaction to match room via WebSocket
      try {
        const io = getIO();
        io.to(`match:${req.params.id}`).emit(`match:${req.params.id}:reaction`, {
          deliveryId,
          emoji,
          userId,
          createdAt: created.createdAt,
        });
      } catch {
        // Non-blocking: if Socket.IO is not ready, skip broadcast
      }

      return reply.status(201).send(created);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'You already reacted to this delivery' });
      }
      throw err;
    }
  });

  // GET /:id/reactions — get reactions for a match (aggregated by delivery)
  app.get<{
    Params: { id: string };
    Querystring: { deliveryId?: string };
  }>('/:id/reactions', async (req) => {
    const conditions = [eq(reaction.matchId, req.params.id)];
    if (req.query.deliveryId) {
      conditions.push(eq(reaction.deliveryId, req.query.deliveryId));
    }

    const rows = await db
      .select({
        deliveryId: reaction.deliveryId,
        emoji: reaction.emoji,
        count: sql<number>`count(*)::int`,
      })
      .from(reaction)
      .where(and(...conditions))
      .groupBy(reaction.deliveryId, reaction.emoji);

    return { data: rows };
  });
};
