import { pgTable, uuid, smallint, varchar, boolean, timestamp, integer, index, jsonb } from 'drizzle-orm/pg-core';
import { delivery } from './delivery';
import { match } from './match';
import { innings } from './innings';
import { team } from './team';

/**
 * Review — DRS (Decision Review System) review records.
 *
 * Tracks team reviews of umpire decisions, including the original
 * and revised decisions, and whether the review was successful.
 */
export const review = pgTable('review', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull().references(() => match.id),
  inningsId: uuid('innings_id').notNull().references(() => innings.id),
  deliveryId: uuid('delivery_id').notNull().references(() => delivery.id),
  reviewingTeamId: uuid('reviewing_team_id').notNull().references(() => team.id),

  // Review sequence
  reviewNumber: smallint('review_number').notNull(),  // nth review for team in this innings

  // Status — 'pending' | 'upheld' | 'overturned' | 'umpires_call'
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  // Decision tracking — { is_wicket, wicket_type, runs_awarded }
  originalDecision: jsonb('original_decision').notNull(),
  revisedDecision: jsonb('revised_decision'),

  // Outcome flags
  wicketReversed: boolean('wicket_reversed').notNull().default(false),
  runsChanged: boolean('runs_changed').notNull().default(false),
  unsuccessful: boolean('unsuccessful').notNull().default(false),

  // Timestamps
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  index('idx_review_match').on(table.matchId),
  index('idx_review_delivery').on(table.deliveryId),
]);
