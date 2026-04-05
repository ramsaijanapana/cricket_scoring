import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { trendingSnapshot } from '../db/schema/trending';
import { eq, and, desc } from 'drizzle-orm';

function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

type TrendingQuery = {
  page?: string;
  limit?: string;
  period?: string;
  city?: string;
  country?: string;
  ball_type?: string;
};

export const trendingRoutes: FastifyPluginAsync = async (app) => {
  // GET /players — trending players
  app.get<{ Querystring: TrendingQuery }>('/players', async (req) => {
    const { limit, offset } = parsePagination(req.query);
    const { period, city, country, ball_type } = req.query;

    const conditions = [eq(trendingSnapshot.entityType, 'player')];
    if (period) conditions.push(eq(trendingSnapshot.period, period));
    if (city) conditions.push(eq(trendingSnapshot.city, city));
    if (country) conditions.push(eq(trendingSnapshot.country, country));
    if (ball_type) conditions.push(eq(trendingSnapshot.ballType, ball_type));

    const rows = await db
      .select()
      .from(trendingSnapshot)
      .where(and(...conditions))
      .orderBy(desc(trendingSnapshot.score))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /teams — trending teams
  app.get<{ Querystring: TrendingQuery }>('/teams', async (req) => {
    const { limit, offset } = parsePagination(req.query);
    const { period, city, country } = req.query;

    const conditions = [eq(trendingSnapshot.entityType, 'team')];
    if (period) conditions.push(eq(trendingSnapshot.period, period));
    if (city) conditions.push(eq(trendingSnapshot.city, city));
    if (country) conditions.push(eq(trendingSnapshot.country, country));

    const rows = await db
      .select()
      .from(trendingSnapshot)
      .where(and(...conditions))
      .orderBy(desc(trendingSnapshot.score))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });

  // GET /matches — trending matches
  app.get<{ Querystring: TrendingQuery }>('/matches', async (req) => {
    const { limit, offset } = parsePagination(req.query);
    const { period, city, country, ball_type } = req.query;

    const conditions = [eq(trendingSnapshot.entityType, 'match')];
    if (period) conditions.push(eq(trendingSnapshot.period, period));
    if (city) conditions.push(eq(trendingSnapshot.city, city));
    if (country) conditions.push(eq(trendingSnapshot.country, country));
    if (ball_type) conditions.push(eq(trendingSnapshot.ballType, ball_type));

    const rows = await db
      .select()
      .from(trendingSnapshot)
      .where(and(...conditions))
      .orderBy(desc(trendingSnapshot.score))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Math.floor(offset / limit) + 1, limit };
  });
};
