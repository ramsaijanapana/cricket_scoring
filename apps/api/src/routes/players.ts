import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { player, playerTeamMembership } from '../db/schema/index';
import { eq } from 'drizzle-orm';
import { parsePagination, paginatedResponse } from '../middleware/pagination';

export const playerRoutes: FastifyPluginAsync = async (app) => {
  // List all players
  app.get('/', async (req) => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const players = await db.query.player.findMany({
      orderBy: (p, { asc }) => [asc(p.lastName), asc(p.firstName)],
      limit,
      offset,
    });
    return paginatedResponse(players, page, limit);
  });

  // Get player by ID
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await db.query.player.findFirst({
      where: eq(player.id, req.params.id),
    });
    if (!result) return reply.status(404).send({ error: 'Player not found' });
    return result;
  });

  // Create player
  app.post<{
    Body: {
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      battingStyle?: string;
      bowlingStyle?: string;
      primaryRole?: string;
    };
  }>('/', async (req, reply) => {
    const [newPlayer] = await db.insert(player).values({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      dateOfBirth: req.body.dateOfBirth,
      battingStyle: req.body.battingStyle,
      bowlingStyle: req.body.bowlingStyle,
      primaryRole: req.body.primaryRole,
    }).returning();
    return reply.status(201).send(newPlayer);
  });

  // Update player
  app.patch<{
    Params: { id: string };
    Body: Partial<{
      firstName: string;
      lastName: string;
      battingStyle: string;
      bowlingStyle: string;
      primaryRole: string;
    }>;
  }>('/:id', async (req, reply) => {
    const [updated] = await db.update(player).set({
      ...req.body,
      updatedAt: new Date(),
    }).where(eq(player.id, req.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Player not found' });
    return updated;
  });

  // Assign player to team
  app.post<{
    Params: { id: string };
    Body: { teamId: string; jerseyNumber?: number; roleInTeam?: string; joinedAt: string };
  }>('/:id/teams', async (req, reply) => {
    const [membership] = await db.insert(playerTeamMembership).values({
      playerId: req.params.id,
      teamId: req.body.teamId,
      jerseyNumber: req.body.jerseyNumber,
      roleInTeam: req.body.roleInTeam,
      joinedAt: req.body.joinedAt,
    }).returning();
    return reply.status(201).send(membership);
  });
};
