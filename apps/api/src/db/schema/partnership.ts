import { pgTable, uuid, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { innings } from './innings';
import { player } from './player';

/**
 * Partnership — tracks batting partnerships within an innings.
 *
 * A new partnership is created when two batsmen are at the crease together.
 * On wicket, the active partnership is ended and a new one begins.
 */
export const partnership = pgTable('partnership', {
  id: uuid('id').primaryKey().defaultRandom(),
  inningsId: uuid('innings_id').notNull().references(() => innings.id, { onDelete: 'cascade' }),
  batter1Id: uuid('batter1_id').notNull().references(() => player.id),
  batter2Id: uuid('batter2_id').notNull().references(() => player.id),
  runs: integer('runs').notNull().default(0),
  balls: integer('balls').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  startedAtRuns: integer('started_at_runs').notNull(),
  endedAtRuns: integer('ended_at_runs'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_partnership_innings').on(table.inningsId),
  index('idx_partnership_active').on(table.inningsId, table.isActive),
]);
