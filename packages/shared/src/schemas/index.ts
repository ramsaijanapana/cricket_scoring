import { z } from 'zod';

// ─── Auth schemas ───────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── Match schemas ──────────────────────────────────────────────────────────

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

// ─── Delivery schemas ───────────────────────────────────────────────────────

export const deliveryInputSchema = z.object({
  innings_num: z.number().int().min(1).max(4),
  bowler_id: z.string().uuid(),
  striker_id: z.string().uuid(),
  non_striker_id: z.string().uuid(),
  runs_batsman: z.number().int().min(0).max(7),
  runs_extras: z.number().int().min(0).max(7).default(0),
  extra_type: z.enum(['wide', 'no_ball', 'bye', 'leg_bye', 'penalty']).nullable().default(null),
  wicket_type: z.enum([
    'bowled', 'caught', 'lbw', 'run_out', 'stumped',
    'hit_wicket', 'obstructing', 'timed_out', 'handled_ball', 'retired_hurt',
  ]).nullable().default(null),
  dismissed_player_id: z.string().uuid().nullable().default(null),
  fielder_id: z.string().uuid().nullable().default(null),
  expected_stack_pos: z.number().int().optional(),
  client_id: z.string().uuid().optional(),
});

// ─── Inferred types ─────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type DeliverySchemaInput = z.infer<typeof deliveryInputSchema>;
