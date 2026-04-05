import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { team } from '../db/schema/index';
import { eq } from 'drizzle-orm';

export const teamRoutes: FastifyPluginAsync = async (app) => {
  // List all teams
  app.get('/', async () => {
    return db.query.team.findMany({
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  });

  // Get team by ID
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await db.query.team.findFirst({
      where: eq(team.id, req.params.id),
    });
    if (!result) return reply.status(404).send({ error: 'Team not found' });
    return result;
  });

  // Create team
  app.post<{
    Body: { name: string; shortName?: string; country?: string; teamType: string; logoUrl?: string };
  }>('/', async (req, reply) => {
    const [newTeam] = await db.insert(team).values({
      name: req.body.name,
      shortName: req.body.shortName,
      country: req.body.country,
      teamType: req.body.teamType,
      logoUrl: req.body.logoUrl,
    }).returning();
    return reply.status(201).send(newTeam);
  });

  // Update team
  app.patch<{
    Params: { id: string };
    Body: Partial<{ name: string; shortName: string; country: string; logoUrl: string }>;
  }>('/:id', async (req, reply) => {
    const [updated] = await db.update(team).set({
      ...req.body,
      updatedAt: new Date(),
    }).where(eq(team.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Team not found' });
    return updated;
  });

  // Delete team
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await db.delete(team).where(eq(team.id, req.params.id));
    return reply.status(204).send();
  });
};
