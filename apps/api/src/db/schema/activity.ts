import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { appUser } from './user';

export const activity = pgTable('activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => appUser.id),
  activityType: varchar('activity_type', { length: 30 }).notNull(),
  entityType: varchar('entity_type', { length: 20 }).notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_activity_user').on(table.userId),
  index('idx_activity_type').on(table.activityType),
  index('idx_activity_created').on(table.createdAt.desc()),
]);

export const feedItem = pgTable('feed_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => appUser.id),
  activityId: uuid('activity_id').notNull().references(() => activity.id),
  seen: boolean('seen').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_feed_item_user_created').on(table.userId, table.createdAt.desc()),
]);
