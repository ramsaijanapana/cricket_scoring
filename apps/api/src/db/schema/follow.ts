import { pgTable, uuid, timestamp, index, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appUser } from './user';
import { team } from './team';

export const follow = pgTable('follow', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id').notNull().references(() => appUser.id),
  followingId: uuid('following_id').notNull().references(() => appUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_follow_pair').on(table.followerId, table.followingId),
  index('idx_follow_follower').on(table.followerId),
  index('idx_follow_following').on(table.followingId),
  check('chk_no_self_follow', sql`${table.followerId} != ${table.followingId}`),
]);

export const teamFollow = pgTable('team_follow', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => appUser.id),
  teamId: uuid('team_id').notNull().references(() => team.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_team_follow').on(table.userId, table.teamId),
]);
