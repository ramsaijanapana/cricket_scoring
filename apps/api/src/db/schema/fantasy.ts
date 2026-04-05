import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';
import { real } from 'drizzle-orm/pg-core';
import { appUser } from './user';
import { match } from './match';

export const fantasyContest = pgTable('fantasy_contest', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  matchId: uuid('match_id').references(() => match.id),
  externalMatchRef: varchar('external_match_ref', { length: 100 }),
  matchSource: varchar('match_source', { length: 30 }).notNull(),
  entryFee: integer('entry_fee').notNull().default(0),
  prizePool: jsonb('prize_pool'),
  maxEntries: integer('max_entries'),
  scoringRules: jsonb('scoring_rules').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  lockTime: timestamp('lock_time', { withTimezone: true }),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => appUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fantasyTeam = pgTable('fantasy_team', {
  id: uuid('id').primaryKey().defaultRandom(),
  contestId: uuid('contest_id').notNull().references(() => fantasyContest.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => appUser.id),
  teamName: varchar('team_name', { length: 100 }),
  players: jsonb('players').notNull(),
  totalPoints: real('total_points').notNull().default(0),
  rank: integer('rank'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_fantasy_team_contest_user').on(table.contestId, table.userId),
]);

export const fantasyPointsLog = pgTable('fantasy_points_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  contestId: uuid('contest_id').notNull().references(() => fantasyContest.id),
  playerId: uuid('player_id').notNull(),
  deliveryId: uuid('delivery_id'),
  points: real('points').notNull(),
  reason: varchar('reason', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
