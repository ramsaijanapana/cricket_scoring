import { pgTable, uuid, varchar, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { match } from './match';
import { delivery } from './delivery';
import { appUser } from './user';

/**
 * Emoji reactions on deliveries within a match.
 * Rate limited: 1 reaction per delivery per user.
 */
export const reaction = pgTable('reaction', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull().references(() => match.id),
  deliveryId: uuid('delivery_id').notNull().references(() => delivery.id),
  userId: uuid('user_id').notNull().references(() => appUser.id),
  emoji: varchar('emoji', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_reaction_delivery_user').on(table.deliveryId, table.userId),
  index('idx_reaction_match').on(table.matchId),
  index('idx_reaction_delivery').on(table.deliveryId),
]);
