import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { appUser } from '../db/schema/index';
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
  // Export user's personal data (GDPR data export)
  app.get('/me/export', async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const user = await db.query.appUser.findFirst({
      where: eq(appUser.id, userId),
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    return sanitizeUser(user);
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

  // Soft-delete user account (GDPR right to erasure)
  app.delete('/me', { preHandler: [requireAuth] }, async (req, reply) => {
    let userId: string;
    try { userId = getUserId(req); } catch { return reply.status(401).send({ error: 'Authentication required' }); }

    const [updated] = await db
      .update(appUser)
      .set({ isActive: false })
      .where(eq(appUser.id, userId))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'User not found' });

    return reply.status(204).send();
  });
};
