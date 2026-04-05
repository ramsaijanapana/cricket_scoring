import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { appUser } from '../db/schema/index';
import { eq } from 'drizzle-orm';

export const userRoutes: FastifyPluginAsync = async (app) => {
  // Export user's personal data (GDPR data export)
  app.get('/me/export', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) return reply.status(401).send({ error: 'Missing x-user-id header' });

    const user = await db.query.appUser.findFirst({
      where: eq(appUser.id, userId),
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const { passwordHash, ...profile } = user;
    return profile;
  });

  // Soft-delete user account (GDPR right to erasure)
  app.delete('/me', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) return reply.status(401).send({ error: 'Missing x-user-id header' });

    const [updated] = await db
      .update(appUser)
      .set({ isActive: false })
      .where(eq(appUser.id, userId))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'User not found' });

    return reply.status(204).send();
  });
};
