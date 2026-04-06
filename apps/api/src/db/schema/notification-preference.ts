import { pgTable, uuid, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { appUser } from './user';

export const notificationPreference = pgTable('notification_preference', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  milestones: boolean('milestones').notNull().default(true),
  wickets: boolean('wickets').notNull().default(true),
  matchCompletion: boolean('match_completion').notNull().default(true),
  followActivity: boolean('follow_activity').notNull().default(true),
  chatMessages: boolean('chat_messages').notNull().default(true),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_notification_pref_user').on(table.userId),
]);
