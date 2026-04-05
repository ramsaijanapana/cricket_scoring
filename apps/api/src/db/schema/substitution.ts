import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { match } from './match';
import { team } from './team';
import { player } from './player';

/**
 * Substitution — player replacement records.
 *
 * Tracks concussion, impact, tactical, and like-for-like substitutions
 * during a match.
 */
export const substitution = pgTable('substitution', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull().references(() => match.id),
  teamId: uuid('team_id').notNull().references(() => team.id),

  // Type — 'concussion' | 'impact' | 'tactical' | 'like_for_like'
  type: varchar('type', { length: 20 }).notNull(),

  // Players involved
  playerOutId: uuid('player_out_id').notNull().references(() => player.id),
  playerInId: uuid('player_in_id').notNull().references(() => player.id),

  // Optional reason
  reason: text('reason'),

  // Timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_substitution_match').on(table.matchId),
]);
