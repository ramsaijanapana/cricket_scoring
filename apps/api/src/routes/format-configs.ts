import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { matchFormatConfig } from '../db/schema/index';
import { eq } from 'drizzle-orm';

export const formatConfigRoutes: FastifyPluginAsync = async (app) => {
  // List all format configs
  app.get('/', async () => {
    return db.query.matchFormatConfig.findMany({
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  });

  // Get format config by ID
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await db.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, req.params.id),
    });
    if (!result) return reply.status(404).send({ error: 'Format config not found' });
    return result;
  });

  // Create format config
  app.post<{
    Body: {
      name: string;
      oversPerInnings?: number;
      inningsPerSide?: number;
      maxBowlerOvers?: number;
      powerplayConfig?: unknown;
      hasSuperOver?: boolean;
      hasDls?: boolean;
      hasFollowOn?: boolean;
      ballsPerOver?: number;
    };
  }>('/', async (req, reply) => {
    const [created] = await db.insert(matchFormatConfig).values({
      name: req.body.name,
      oversPerInnings: req.body.oversPerInnings ?? null,
      inningsPerSide: req.body.inningsPerSide ?? 2,
      maxBowlerOvers: req.body.maxBowlerOvers ?? null,
      powerplayConfig: req.body.powerplayConfig ?? null,
      hasSuperOver: req.body.hasSuperOver ?? false,
      hasDls: req.body.hasDls ?? false,
      hasFollowOn: req.body.hasFollowOn ?? false,
      ballsPerOver: req.body.ballsPerOver ?? 6,
    }).returning();
    return reply.status(201).send(created);
  });

  // Update format config
  app.patch<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      oversPerInnings: number;
      inningsPerSide: number;
      maxBowlerOvers: number;
      powerplayConfig: unknown;
      hasSuperOver: boolean;
      hasDls: boolean;
      hasFollowOn: boolean;
      ballsPerOver: number;
    }>;
  }>('/:id', async (req, reply) => {
    const [updated] = await db.update(matchFormatConfig)
      .set(req.body)
      .where(eq(matchFormatConfig.id, req.params.id))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Format config not found' });
    return updated;
  });
};
