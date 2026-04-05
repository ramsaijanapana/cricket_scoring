import { pgTable, uuid, varchar, text, timestamp, jsonb, index, primaryKey } from 'drizzle-orm/pg-core';
import { appUser } from './user';
import { team } from './team';
import { match } from './match';

export const chatRoom = pgTable('chat_room', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 20 }).notNull(),
  name: varchar('name', { length: 100 }),
  teamId: uuid('team_id').references(() => team.id),
  matchId: uuid('match_id').references(() => match.id),
  createdBy: uuid('created_by').references(() => appUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessage = pgTable('chat_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => chatRoom.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => appUser.id),
  content: text('content').notNull(),
  messageType: varchar('message_type', { length: 20 }).notNull().default('text'),
  replyToId: uuid('reply_to_id'),
  metadata: jsonb('metadata'),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_chat_message_room_created').on(table.roomId, table.createdAt.desc()),
]);

export const chatMember = pgTable('chat_member', {
  roomId: uuid('room_id').notNull().references(() => chatRoom.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.roomId, table.userId] }),
]);
