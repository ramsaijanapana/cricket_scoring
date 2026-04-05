import { pgTable, uuid, varchar, integer, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { team } from './team';
import { tournament } from './tournament';
import { matchFormatConfig } from './match-format';

export const match = pgTable('match', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').references(() => tournament.id),
  formatConfigId: uuid('format_config_id').notNull().references(() => matchFormatConfig.id),
  matchNumber: integer('match_number'),
  venue: varchar('venue', { length: 300 }),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 100 }),
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
  actualStart: timestamp('actual_start', { withTimezone: true }),
  actualEnd: timestamp('actual_end', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('scheduled'),
  tossWinnerTeamId: uuid('toss_winner_team_id').references(() => team.id),
  tossDecision: varchar('toss_decision', { length: 10 }),
  resultSummary: text('result_summary'),
  winnerTeamId: uuid('winner_team_id').references(() => team.id),
  winMarginRuns: integer('win_margin_runs'),
  winMarginWickets: integer('win_margin_wickets'),
  isDlsApplied: boolean('is_dls_applied').default(false),
  dlsParScore: integer('dls_par_score'),
  matchOfficials: jsonb('match_officials'),
  ballType: varchar('ball_type', { length: 20 }),
  cricketType: varchar('cricket_type', { length: 30 }),
  isPublic: boolean('is_public').notNull().default(true),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_match_tournament').on(table.tournamentId),
  index('idx_match_status').on(table.status),
]);

export const matchTeam = pgTable('match_team', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull().references(() => match.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').notNull().references(() => team.id),
  designation: varchar('designation', { length: 10 }).notNull(),
  playingXi: uuid('playing_xi').array(),
}, (table) => [
  index('idx_match_team_match').on(table.matchId),
]);
