import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { auditLog } from '../db/schema/audit-log';
import { eq, desc } from 'drizzle-orm';

function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Audit log routes — undo/correction history for a match.
 * Mounted under /api/v1/matches
 */
export const auditLogRoutes: FastifyPluginAsync = async (app) => {
  // GET /:id/audit-log — return undo/correction history for a match
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string };
  }>('/:id/audit-log', async (req) => {
    const { limit, offset, page } = parsePagination(req.query);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.matchId, req.params.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page, limit };
  });
};
