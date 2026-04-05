import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ─── Match creation ──────────────────────────────────────────────────────────

export const createMatchSchema = z.object({
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
  formatConfigId: z.string().min(1),
  tournamentId: z.string().uuid().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  scheduledStart: z.string().datetime().optional(),
  homePlayingXi: z.array(z.string().uuid()).optional().default([]),
  awayPlayingXi: z.array(z.string().uuid()).optional().default([]),
  tossWinnerTeamId: z.string().uuid().optional(),
  tossDecision: z.string().optional(),
}).refine(d => d.homeTeamId !== d.awayTeamId, {
  message: 'Home and away teams must be different',
});

// ─── Delivery input ──────────────────────────────────────────────────────────

export const recordDeliverySchema = z.object({
  innings_num: z.number().int().min(1).max(4),
  bowler_id: z.string().min(1),
  striker_id: z.string().min(1),
  non_striker_id: z.string().min(1),
  runs_batsman: z.number().int().min(0).max(7),
  runs_extras: z.number().int().min(0).max(7).default(0),
  extra_type: z.enum(['wide', 'noball', 'bye', 'legbye', 'penalty']).nullable().default(null),
  is_wicket: z.boolean().default(false),
  wicket_type: z.enum([
    'bowled', 'caught', 'lbw', 'run_out', 'stumped',
    'hit_wicket', 'obstructing', 'timed_out', 'handled_ball', 'retired_hurt',
  ]).nullable().default(null),
  dismissed_player_id: z.string().uuid().nullable().default(null),
  fielder_id: z.string().uuid().nullable().default(null),
  is_dead_ball: z.boolean().default(false),
  expected_stack_pos: z.number().int().optional(),
  client_id: z.string().uuid().optional(),
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

// ─── Auth ────────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
