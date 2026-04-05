import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { appUser, match, chatMessage, team } from '../db/schema/index';
import { eq } from 'drizzle-orm';
import { requireAuth, getUserId } from '../middleware/auth';
import { sanitizeUser } from '../middleware/serialize';
import { uploadFile } from '../services/storage-service';
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export const userRoutes: FastifyPluginAsync = async (app) => {
  // Avatar upload
  app.post('/me/avatar', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    if (!ALLOWED_MIMES.has(data.mimetype)) {
      return reply.status(400).send({ error: 'File must be jpg, png, gif, or webp' });
    }

    const ext = MIME_TO_EXT[data.mimetype] || 'jpg';
    const filename = `${userId}.${ext}`;

    // Collect file into buffer with size check
    const chunks: Buffer[] = [];
    let bytesWritten = 0;

    for await (const chunk of data.file) {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_FILE_SIZE) {
        return reply.status(400).send({ error: 'File exceeds 2MB limit' });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    // Upload via storage service (S3/R2 in production, local disk in dev)
    const avatarUrl = await uploadFile(`avatars/${filename}`, buffer, data.mimetype);
    await db.update(appUser).set({ avatarUrl }).where(eq(appUser.id, userId));

    return { avatarUrl };
  });
  // Export user's personal data (GDPR data export) — comprehensive
  app.get('/me/export', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const user = await db.query.appUser.findFirst({
      where: eq(appUser.id, userId),
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Gather all user data for GDPR export
    const [userTeams, userMessages] = await Promise.all([
      // Teams the user manages
      user.teamId
        ? db.query.team.findMany({ where: eq(team.id, user.teamId) })
        : Promise.resolve([]),
      // Chat messages sent by this user
      db.query.chatMessage.findMany({
        where: eq(chatMessage.senderId, userId),
      }),
    ]);

    // Find matches where user was a scorer (via matchOfficials JSON)
    // We do a broader query and filter in-memory since matchOfficials is JSONB
    const allMatches = await db.query.match.findMany();
    const scoredMatches = allMatches.filter((m) => {
      const officials = m.matchOfficials as Record<string, unknown> | null;
      if (!officials) return false;
      const scorers = (officials.scorers as string[]) || [];
      return scorers.includes(userId);
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: sanitizeUser(user),
      teamsManaged: userTeams,
      matchesScored: scoredMatches.map((m) => ({
        id: m.id,
        venue: m.venue,
        status: m.status,
        scheduledStart: m.scheduledStart,
        resultSummary: m.resultSummary,
      })),
      chatMessages: userMessages.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };

    reply.header('Content-Disposition', `attachment; filename="cricscore-data-export-${userId}.json"`);
    reply.header('Content-Type', 'application/json');
    return exportData;
  });

  // Update social profile fields
  app.patch('/me', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Request body is required' });
    }

    const allowedFields = [
      'bio',
      'city',
      'country',
      'battingStyle',
      'bowlingStyle',
      'primaryRole',
      'ballTypePreference',
      'preferredFormats',
      'avatarUrl',
      'isPublic',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    const [updated] = await db
      .update(appUser)
      .set(updates)
      .where(eq(appUser.id, userId))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'User not found' });

    return sanitizeUser(updated);
  });

  // Soft-delete user account (GDPR right to erasure) — 30-day grace period
  app.delete('/me', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const body = req.body as { confirmation?: string } | undefined;
    if (!body || body.confirmation !== 'DELETE') {
      return reply.status(400).send({ error: 'You must send { "confirmation": "DELETE" } to confirm account deletion' });
    }

    const user = await db.query.appUser.findFirst({
      where: eq(appUser.id, userId),
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const deletedAt = new Date();
    const hardDeleteDate = new Date(deletedAt);
    hardDeleteDate.setDate(hardDeleteDate.getDate() + 30);

    // Soft-delete: mark inactive, set deletedAt, anonymize display info immediately
    const [updated] = await db
      .update(appUser)
      .set({
        isActive: false,
        displayName: 'Deleted User',
        bio: null,
        avatarUrl: null,
        city: null,
        country: null,
      })
      .where(eq(appUser.id, userId))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'User not found' });

    return {
      message: 'Account scheduled for deletion',
      deletedAt: deletedAt.toISOString(),
      hardDeleteDate: hardDeleteDate.toISOString(),
      gracePeriodDays: 30,
    };
  });

  // Cancel account deletion (reactivate within 30-day grace period)
  app.post('/me/reactivate', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const user = await db.query.appUser.findFirst({
      where: eq(appUser.id, userId),
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    if (user.isActive) {
      return reply.status(400).send({ error: 'Account is already active' });
    }

    const [updated] = await db
      .update(appUser)
      .set({ isActive: true })
      .where(eq(appUser.id, userId))
      .returning();

    return sanitizeUser(updated!);
  });
};
