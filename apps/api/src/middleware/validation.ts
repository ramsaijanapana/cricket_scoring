import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';

export {
  registerSchema,
  loginSchema,
  createMatchSchema,
  deliveryInputSchema,
} from '@cricket/shared';

import { deliveryInputSchema } from '@cricket/shared';

// ─── Delivery input ──────────────────────────────────────────────────────────
// API-specific extensions and refinements on top of deliveryInputSchema (@cricket/shared).

export const recordDeliverySchema = deliveryInputSchema.extend({
  bowler_id: z.string().min(1),
  striker_id: z.string().min(1),
  non_striker_id: z.string().min(1),
}).refine(
  d => !d.is_wicket || (d.wicket_type !== null && d.wicket_type !== undefined),
  { message: 'wicket_type is required when is_wicket is true', path: ['wicket_type'] },
).refine(
  d => !d.is_wicket || d.dismissed_player_id !== null,
  { message: 'dismissed_player_id is required when is_wicket is true', path: ['dismissed_player_id'] },
).refine(
  d => !(d.is_dead_ball && d.is_wicket),
  { message: 'A dead ball cannot result in a wicket', path: ['is_dead_ball'] },
);

// ─── Validation middleware helper ────────────────────────────────────────────

export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.flatten().fieldErrors,
        },
      });
    }
    (request as any).validated = result.data;
  };
}
