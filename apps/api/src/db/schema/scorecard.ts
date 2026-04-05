import { pgTable, uuid, smallint, integer, varchar, boolean, numeric, unique, index } from 'drizzle-orm/pg-core';
import { innings } from './innings';
import { player } from './player';
import { team } from './team';

export const battingScorecard = pgTable('batting_scorecard', {
  id: uuid('id').primaryKey().defaultRandom(),
  inningsId: uuid('innings_id').notNull().references(() => innings.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => player.id),
  teamId: uuid('team_id').notNull().references(() => team.id),
  battingPosition: smallint('batting_position').notNull(),

  runsScored: integer('runs_scored').notNull().default(0),
  ballsFaced: integer('balls_faced').notNull().default(0),
  fours: integer('fours').notNull().default(0),
  sixes: integer('sixes').notNull().default(0),
  strikeRate: numeric('strike_rate', { precision: 6, scale: 2 }),
  minutesBatted: integer('minutes_batted'),

  isOut: boolean('is_out').notNull().default(false),
  dismissalType: varchar('dismissal_type', { length: 30 }),
  dismissedById: uuid('dismissed_by_id').references(() => player.id),
  fielderId: uuid('fielder_id').references(() => player.id),
  dismissalText: varchar('dismissal_text', { length: 200 }),

  dots: integer('dots').notNull().default(0),
  singles: integer('singles').notNull().default(0),
  doubles: integer('doubles').notNull().default(0),
  triples: integer('triples').notNull().default(0),

  isNotOut: boolean('is_not_out').notNull().default(false),
  didNotBat: boolean('did_not_bat').notNull().default(false),
}, (table) => [
  unique('uq_bat_innings_player').on(table.inningsId, table.playerId),
  index('idx_bat_sc_player').on(table.playerId),
  index('idx_bat_sc_innings').on(table.inningsId),
]);

export const bowlingScorecard = pgTable('bowling_scorecard', {
  id: uuid('id').primaryKey().defaultRandom(),
  inningsId: uuid('innings_id').notNull().references(() => innings.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => player.id),
  teamId: uuid('team_id').notNull().references(() => team.id),
  bowlingPosition: smallint('bowling_position'),

  oversBowled: numeric('overs_bowled', { precision: 4, scale: 1 }).notNull().default('0'),
  maidens: integer('maidens').notNull().default(0),
  runsConceded: integer('runs_conceded').notNull().default(0),
  wicketsTaken: integer('wickets_taken').notNull().default(0),
  economyRate: numeric('economy_rate', { precision: 5, scale: 2 }),
  dots: integer('dots').notNull().default(0),
  foursConceded: integer('fours_conceded').notNull().default(0),
  sixesConceded: integer('sixes_conceded').notNull().default(0),
  wides: integer('wides').notNull().default(0),
  noBalls: integer('no_balls').notNull().default(0),
  extrasConceded: integer('extras_conceded').notNull().default(0),
}, (table) => [
  unique('uq_bowl_innings_player').on(table.inningsId, table.playerId),
  index('idx_bowl_sc_player').on(table.playerId),
  index('idx_bowl_sc_innings').on(table.inningsId),
]);

export const fieldingScorecard = pgTable('fielding_scorecard', {
  id: uuid('id').primaryKey().defaultRandom(),
  inningsId: uuid('innings_id').notNull().references(() => innings.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => player.id),
  teamId: uuid('team_id').notNull().references(() => team.id),

  catches: integer('catches').notNull().default(0),
  runOuts: integer('run_outs').notNull().default(0),
  stumpings: integer('stumpings').notNull().default(0),
  directHits: integer('direct_hits').notNull().default(0),
}, (table) => [
  unique('uq_field_innings_player').on(table.inningsId, table.playerId),
]);
