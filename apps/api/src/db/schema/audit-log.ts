import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  matchId: uuid('match_id'),
  action: varchar('action', { length: 50 }).notNull(), // 'delivery_recorded', 'delivery_undone', 'delivery_corrected', 'match_status_changed'
  entityType: varchar('entity_type', { length: 50 }).notNull(), // 'delivery', 'innings', 'match'
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
