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
});

// ─── Team & Player schemas ──────────────────────────────────────────────────

export const createTeamSchema = z.object({
  name: z.string().min(1).max(200),
  shortName: z.string().max(10).optional(),
  country: z.string().max(100).optional(),
  teamType: z.enum(['international', 'domestic', 'club', 'custom']),
  logoUrl: z.string().optional(),
});

export const createPlayerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().optional(),
  battingStyle: z.enum(['right_hand', 'left_hand']).optional(),
  bowlingStyle: z.enum([
    'right_arm_fast',
    'right_arm_medium',
    'right_arm_off_break',
    'right_arm_leg_break',
    'left_arm_fast',
    'left_arm_medium',
    'left_arm_orthodox',
    'left_arm_chinaman',
  ]).optional(),
  primaryRole: z.enum(['batsman', 'bowler', 'all_rounder', 'wicket_keeper']).optional(),
});

// ─── Tournament schemas ─────────────────────────────────────────────────────

export const createTournamentSchema = z.object({
  name: z.string().min(1).max(300),
  shortName: z.string().max(30).optional(),
  season: z.string().max(20).optional(),
  format: z.enum(['t20', 'odi', 'test', 'the_hundred', 't10', 'custom']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  organizer: z.string().max(200).optional(),
  groupStageConfig: z.object({
    groups: z.number().int().min(1).max(8).optional(),
    teamsPerGroup: z.number().int().min(2).max(20).optional(),
    pointsForWin: z.number().int().default(2),
    pointsForTie: z.number().int().default(1),
    pointsForNR: z.number().int().default(1),
  }).optional(),
  teamIds: z.array(z.string().uuid()).optional(),
});

export const addFixtureSchema = z.object({
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
  formatConfigId: z.string().min(1),
  matchNumber: z.number().int().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  scheduledStart: z.string().optional(),
  stage: z.enum(['group', 'quarter_final', 'semi_final', 'final', 'eliminator', 'qualifier']).optional(),
});

// ─── Inferred types ─────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type DeliverySchemaInput = z.infer<typeof deliveryInputSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type AddFixtureInput = z.infer<typeof addFixtureSchema>;
