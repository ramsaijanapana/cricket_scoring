import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { review } from '../db/schema/review';
import { delivery } from '../db/schema/index';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';

/**
 * Review routes — DRS review management.
 *
 * POST   /api/matches/:id/reviews             — create a new DRS review
 * PATCH  /api/matches/:id/reviews/:reviewId   — update review outcome
 */
export const reviewRoutes: FastifyPluginAsync = async (app) => {
  // Create a new DRS review
  app.post<{
    Params: { id: string };
    Body: {
      deliveryId: string;
      reviewingTeamId: string;
      inningsId: string;
    };
  }>('/:id/reviews', { preHandler: [requireAuth] }, async (req, reply) => {
    const { deliveryId, reviewingTeamId, inningsId } = req.body;
    const matchId = req.params.id;

    // Look up the delivery to populate originalDecision
    const deliveryRecord = await db.query.delivery.findFirst({
      where: eq(delivery.id, deliveryId),
    });

    if (!deliveryRecord) {
      return reply.status(404).send({ error: 'Delivery not found' });
    }

    const originalDecision = {
      is_wicket: deliveryRecord.isWicket,
      wicket_type: deliveryRecord.wicketType,
      runs_awarded: deliveryRecord.totalRuns,
    };

    // Count existing reviews for this team in this match+innings to determine reviewNumber
    const existingReviews = await db.query.review.findMany({
      where: and(
        eq(review.matchId, matchId),
        eq(review.reviewingTeamId, reviewingTeamId),
        eq(review.inningsId, inningsId),
      ),
    });
    const reviewNumber = existingReviews.length + 1;

    const [newReview] = await db.insert(review).values({
      matchId,
      inningsId,
      deliveryId,
      reviewingTeamId,
      reviewNumber,
      originalDecision,
    }).returning();

    return reply.status(201).send(newReview);
  });

  // Update review outcome
  app.patch<{
    Params: { id: string; reviewId: string };
    Body: {
      status: 'upheld' | 'overturned' | 'umpires_call';
      revisedDecision?: Record<string, unknown>;
      wicketReversed?: boolean;
      runsChanged?: boolean;
    };
  }>('/:id/reviews/:reviewId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { reviewId } = req.params;
    const { status, revisedDecision, wicketReversed, runsChanged } = req.body;

    // A review is unsuccessful unless it results in 'overturned' or 'umpires_call'
    const unsuccessful = status !== 'overturned' && status !== 'umpires_call';

    const [updatedReview] = await db
      .update(review)
      .set({
        status,
        ...(revisedDecision !== undefined && { revisedDecision }),
        ...(wicketReversed !== undefined && { wicketReversed }),
        ...(runsChanged !== undefined && { runsChanged }),
        unsuccessful,
        resolvedAt: new Date(),
      })
      .where(eq(review.id, reviewId))
      .returning();

    if (!updatedReview) {
      return reply.status(404).send({ error: 'Review not found' });
    }

    return reply.send(updatedReview);
  });
};
