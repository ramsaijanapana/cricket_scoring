import { pgTable, uuid, varchar, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const matchFormatConfig = pgTable('match_format_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull(),
  oversPerInnings: integer('overs_per_innings'),
  inningsPerSide: integer('innings_per_side').notNull(),
  maxBowlerOvers: integer('max_bowler_overs'),
  powerplayConfig: jsonb('powerplay_config'),
  hasSuperOver: boolean('has_super_over').default(false),
  hasDls: boolean('has_dls').default(false),
  hasFollowOn: boolean('has_follow_on').default(false),
  followOnThreshold: integer('follow_on_threshold'),
  ballsPerOver: integer('balls_per_over').notNull().default(6),
  // Session schedule for multi-day matches (Test, First-Class)
  // e.g. [{ session: 1, start: "10:00", end: "12:30" }, { session: 2, start: "13:10", end: "15:40" }, ...]
  sessionSchedule: jsonb('session_schedule'),
  // Bonus points config (First-Class competitions)
  // e.g. { hasBonusPoints: true, battingBonusOversLimit: 110, type: "first_class" }
  bonusPointsConfig: jsonb('bonus_points_config'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
