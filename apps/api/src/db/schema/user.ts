import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { player } from './player';
import { team } from './team';

export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 300 }).notNull().unique(),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  role: varchar('role', { length: 20 }).notNull(),
  playerId: uuid('player_id').references(() => player.id),
  teamId: uuid('team_id').references(() => team.id),
  isActive: boolean('is_active').notNull().default(true),
  bio: text('bio'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 100 }),
  battingStyle: varchar('batting_style', { length: 20 }),
  bowlingStyle: varchar('bowling_style', { length: 30 }),
  preferredFormats: text('preferred_formats').array(),
  ballTypePreference: text('ball_type_preference').array(),
  primaryRole: varchar('primary_role', { length: 20 }),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
