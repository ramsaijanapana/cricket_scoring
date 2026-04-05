import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { chatRoom, chatMessage, chatMember } from '../db/schema/chat';
import { appUser } from '../db/schema/user';
import { eq, and, desc, sql } from 'drizzle-orm';
import { socialBroadcast } from '../services/realtime';
import { requireAuth, getUserId } from '../middleware/auth';

function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // GET /rooms — list user's chat rooms
  app.get<{ Querystring: { page?: string; limit?: string } }>('/rooms', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { limit, offset } = parsePagination(req.query);

    const rooms = await db
      .select({
        id: chatRoom.id,
        type: chatRoom.type,
        name: chatRoom.name,
        teamId: chatRoom.teamId,
        matchId: chatRoom.matchId,
        createdAt: chatRoom.createdAt,
        role: chatMember.role,
        lastReadAt: chatMember.lastReadAt,
      })
      .from(chatMember)
      .innerJoin(chatRoom, eq(chatMember.roomId, chatRoom.id))
      .where(eq(chatMember.userId, userId))
      .orderBy(desc(chatRoom.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rooms, page: Math.floor(offset / limit) + 1, limit };
  });

  // POST /rooms — create room
  app.post<{
    Body: {
      type: string;
      name?: string;
      teamId?: string;
      matchId?: string;
      memberIds?: string[];
    };
  }>('/rooms', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const { type, name, teamId, matchId, memberIds } = req.body;

    if (!type) return reply.status(400).send({ error: 'Room type is required' });

    const [room] = await db.insert(chatRoom).values({
      type,
      name: name || null,
      teamId: teamId || null,
      matchId: matchId || null,
      createdBy: userId,
    }).returning();

    // Add creator as admin
    await db.insert(chatMember).values({
      roomId: room.id,
      userId,
      role: 'admin',
    });

    // Add other members
    if (memberIds && memberIds.length > 0) {
      const memberValues = memberIds
        .filter((id) => id !== userId)
        .map((id) => ({ roomId: room.id, userId: id, role: 'member' as const }));
      if (memberValues.length > 0) {
        await db.insert(chatMember).values(memberValues);
      }
    }

    return reply.status(201).send(room);
  });

  // GET /rooms/:id/messages — paginated messages
  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/rooms/:id/messages',
    async (req, reply) => {
      let userId: string;
      try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

      // Verify membership
      const membership = await db
        .select()
        .from(chatMember)
        .where(and(eq(chatMember.roomId, req.params.id), eq(chatMember.userId, userId)))
        .limit(1);
      if (membership.length === 0) return reply.status(403).send({ error: 'Not a member of this room' });

      const { limit, offset } = parsePagination(req.query);

      const messages = await db
        .select({
          id: chatMessage.id,
          senderId: chatMessage.senderId,
          senderName: appUser.displayName,
          senderAvatar: appUser.avatarUrl,
          content: chatMessage.content,
          messageType: chatMessage.messageType,
          replyToId: chatMessage.replyToId,
          metadata: chatMessage.metadata,
          editedAt: chatMessage.editedAt,
          deletedAt: chatMessage.deletedAt,
          createdAt: chatMessage.createdAt,
        })
        .from(chatMessage)
        .innerJoin(appUser, eq(chatMessage.senderId, appUser.id))
        .where(eq(chatMessage.roomId, req.params.id))
        .orderBy(desc(chatMessage.createdAt))
        .limit(limit)
        .offset(offset);

      // Update last_read_at
      await db
        .update(chatMember)
        .set({ lastReadAt: new Date() })
        .where(and(eq(chatMember.roomId, req.params.id), eq(chatMember.userId, userId)));

      return { data: messages, page: Math.floor(offset / limit) + 1, limit };
    },
  );

  // POST /rooms/:id/messages — send message
  app.post<{
    Params: { id: string };
    Body: { content: string; messageType?: string; replyToId?: string; metadata?: any };
  }>('/rooms/:id/messages', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    // Verify membership
    const membership = await db
      .select()
      .from(chatMember)
      .where(and(eq(chatMember.roomId, req.params.id), eq(chatMember.userId, userId)))
      .limit(1);
    if (membership.length === 0) return reply.status(403).send({ error: 'Not a member of this room' });

    if (!req.body.content) return reply.status(400).send({ error: 'Content is required' });

    const [message] = await db.insert(chatMessage).values({
      roomId: req.params.id,
      senderId: userId,
      content: req.body.content,
      messageType: req.body.messageType || 'text',
      replyToId: req.body.replyToId || null,
      metadata: req.body.metadata || null,
    }).returning();

    // Emit real-time chat message to the room via Socket.IO /social namespace
    try {
      // Fetch sender info for the broadcast payload
      const sender = await db.query.appUser.findFirst({ where: eq(appUser.id, userId) });
      socialBroadcast.chatMessage(req.params.id, {
        ...message,
        senderName: sender?.displayName ?? null,
        senderAvatar: sender?.avatarUrl ?? null,
      });
    } catch {
      // Non-critical — message is persisted even if broadcast fails
    }

    return reply.status(201).send(message);
  });

  // GET /direct/:userId — get or create DM room
  app.get<{ Params: { userId: string } }>('/direct/:userId', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const otherUserId = req.params.userId;
    if (userId === otherUserId) return reply.status(400).send({ error: 'Cannot DM yourself' });

    // Verify target user exists
    const targetUser = await db.query.appUser.findFirst({ where: eq(appUser.id, otherUserId) });
    if (!targetUser) return reply.status(404).send({ error: 'User not found' });

    // Look for existing DM room between these two users
    const existingRooms = await db.execute(sql`
      SELECT cr.id, cr.type, cr.name, cr.created_at
      FROM chat_room cr
      WHERE cr.type = 'direct'
        AND EXISTS (SELECT 1 FROM chat_member cm1 WHERE cm1.room_id = cr.id AND cm1.user_id = ${userId})
        AND EXISTS (SELECT 1 FROM chat_member cm2 WHERE cm2.room_id = cr.id AND cm2.user_id = ${otherUserId})
      LIMIT 1
    `);

    if (existingRooms.length > 0) {
      return existingRooms[0];
    }

    // Create new DM room
    const [room] = await db.insert(chatRoom).values({
      type: 'direct',
      createdBy: userId,
    }).returning();

    await db.insert(chatMember).values([
      { roomId: room.id, userId, role: 'member' },
      { roomId: room.id, userId: otherUserId, role: 'member' },
    ]);

    return reply.status(201).send(room);
  });
};
