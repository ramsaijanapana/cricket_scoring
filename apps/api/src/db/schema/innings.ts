import { pgTable, uuid, smallint, integer, numeric, boolean, varchar, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { match } from './match';
import { team } from './team';
import { player } from './player';

export const innings = pgTable('innings', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull().references(() => match.id, { onDelete: 'cascade' }),
  inningsNumber: smallint('innings_number').notNull(),
  battingTeamId: uuid('batting_team_id').notNull().references(() => team.id),
  bowlingTeamId: uuid('bowling_team_id').notNull().references(() => team.id),
  isSuperOver: boolean('is_super_over').notNull().default(false),
  totalRuns: integer('total_runs').notNull().default(0),
  totalWickets: integer('total_wickets').notNull().default(0),
  totalOvers: numeric('total_overs', { precision: 5, scale: 1 }).notNull().default('0'),
  totalExtras: integer('total_extras').notNull().default(0),
  declared: boolean('declared').notNull().default(false),
  followOn: boolean('follow_on').notNull().default(false),
  allOut: boolean('all_out').notNull().default(false),
  targetScore: integer('target_score'),
  status: varchar('status', { length: 20 }).notNull().default('not_started'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  unique('uq_match_innings').on(table.matchId, table.inningsNumber),
  index('idx_innings_match').on(table.matchId),
]);

export const over = pgTable('over', {
  id: uuid('id').primaryKey().defaultRandom(),
  inningsId: uuid('innings_id').notNull().references(() => innings.id, { onDelete: 'cascade' }),
  overNumber: smallint('over_number').notNull(),
  bowlerId: uuid('bowler_id').notNull().references(() => player.id),
  runsConceded: integer('runs_conceded').notNull().default(0),
  wicketsTaken: integer('wickets_taken').notNull().default(0),
  maidens: boolean('maidens').notNull().default(false),
  legalBalls: smallint('legal_balls').notNull().default(0),
  totalBalls: smallint('total_balls').notNull().default(0),
}, (table) => [
  unique('uq_innings_over').on(table.inningsId, table.overNumber),
  index('idx_over_innings').on(table.inningsId),
  index('idx_over_bowler').on(table.bowlerId),
]);
