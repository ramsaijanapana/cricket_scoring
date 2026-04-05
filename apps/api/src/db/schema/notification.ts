import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { appUser } from './user';

export const notification = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => appUser.id),
  type: varchar('type', { length: 30 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  data: jsonb('data'),
  read: boolean('read').notNull().default(false),
  pushSent: boolean('push_sent').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_notification_user_created').on(table.userId, table.createdAt.desc()),
]);
