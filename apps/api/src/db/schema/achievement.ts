import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { appUser } from './user';
import { match } from './match';

export const achievement = pgTable('achievement', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  iconUrl: varchar('icon_url', { length: 500 }),
  category: varchar('category', { length: 30 }).notNull(),
  rarity: varchar('rarity', { length: 20 }).notNull().default('common'),
  criteria: jsonb('criteria'),
  xpReward: integer('xp_reward').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userAchievement = pgTable('user_achievement', {
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  achievementId: uuid('achievement_id').notNull().references(() => achievement.id),
  earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  matchId: uuid('match_id').references(() => match.id),
  metadata: jsonb('metadata'),
}, (table) => [
  primaryKey({ columns: [table.userId, table.achievementId] }),
]);
