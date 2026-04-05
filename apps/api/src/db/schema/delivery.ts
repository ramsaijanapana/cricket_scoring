import { pgTable, uuid, smallint, integer, varchar, text, boolean, numeric, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { over, innings } from './innings';
import { match } from './match';
import { player } from './player';

/**
 * Delivery — the immutable event-source record.
 *
 * Per context.md section 5.2 and section 13:
 * - Delivery records are IMMUTABLE. Corrections create override records; they never mutate the original.
 * - undo_stack_pos and legal_ball_num are critical for scoring integrity.
 * - Each delivery stores a state snapshot for fast reads without event replay.
 */
export const delivery = pgTable('delivery', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull().references(() => match.id),
  inningsId: uuid('innings_id').notNull().references(() => innings.id),
  overId: uuid('over_id').notNull().references(() => over.id, { onDelete: 'cascade' }),

  // Sequence — context.md section 5.2
  overNum: smallint('over_num').notNull(),           // 0-indexed over number
  ballNum: smallint('ball_num').notNull(),            // 1-indexed within over; >6 = extras
  legalBallNum: smallint('legal_ball_num').notNull(),  // count of legal deliveries (critical for scoring integrity)

  // Participants
  bowlerId: uuid('bowler_id').notNull().references(() => player.id),
  strikerId: uuid('striker_id').notNull().references(() => player.id),
  nonStrikerId: uuid('non_striker_id').notNull().references(() => player.id),

  // Outcome — context.md section 5.2
  runsBatsman: smallint('runs_batsman').notNull().default(0),   // 0–6 including overthrows
  runsExtras: smallint('runs_extras').notNull().default(0),
  extraType: varchar('extra_type', { length: 10 }),             // 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty' | null
  totalRuns: smallint('total_runs').notNull().default(0),       // computed: runs_batsman + runs_extras
  isFreeHit: boolean('is_free_hit').notNull().default(false),   // true if delivery follows a front-foot no-ball

  // Dismissal
  isWicket: boolean('is_wicket').notNull().default(false),
  wicketType: varchar('wicket_type', { length: 20 }),
    // 'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket'
    // | 'obstructing' | 'timed_out' | 'handled_ball' | null
  dismissedId: uuid('dismissed_id').references(() => player.id),  // may differ from striker (run out)
  fielderIds: uuid('fielder_ids').array(),                        // catcher, run-out thrower, etc.
  isRetiredHurt: boolean('is_retired_hurt').notNull().default(false),
  isDeadBall: boolean('is_dead_ball').notNull().default(false),

  // Shot & Pitch Tracking (optional, for analytics) — context.md section 5.2
  shotType: varchar('shot_type', { length: 30 }),     // cut, pull, drive, sweep, etc.
  landingX: numeric('landing_x', { precision: 6, scale: 3 }),  // pitch map coordinates
  landingY: numeric('landing_y', { precision: 6, scale: 3 }),
  wagonX: numeric('wagon_x', { precision: 6, scale: 3 }),      // wagon wheel endpoint
  wagonY: numeric('wagon_y', { precision: 6, scale: 3 }),
  paceKmh: numeric('pace_kmh', { precision: 5, scale: 1 }),
  swingType: varchar('swing_type', { length: 20 }),

  // State snapshot — for fast reads without event replay (context.md section 5.2)
  inningsScore: integer('innings_score').notNull().default(0),    // cumulative score AFTER this ball
  inningsWickets: integer('innings_wickets').notNull().default(0),
  inningsOvers: varchar('innings_overs', { length: 10 }).notNull().default('0.0'),  // e.g. "12.4"
  runRate: numeric('run_rate', { precision: 5, scale: 2 }).notNull().default('0'),

  // Commentary link
  commentaryId: uuid('commentary_id'),

  // Event sourcing — context.md section 13
  undoStackPos: integer('undo_stack_pos').notNull(),   // event-source ordering position
  isOverridden: boolean('is_overridden').notNull().default(false), // true if corrected by a later record
  overrideOfId: uuid('override_of_id').references((): any => delivery.id),  // links correction to original

  // Idempotency key — prevents duplicate submissions from retries
  clientId: uuid('client_id').unique(),

  // Timestamp
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),  // ISO 8601
}, (table) => [
  index('idx_delivery_match').on(table.matchId),
  index('idx_delivery_innings').on(table.inningsId),
  index('idx_delivery_over').on(table.overId),
  index('idx_delivery_striker').on(table.strikerId),
  index('idx_delivery_bowler').on(table.bowlerId),
  index('idx_delivery_undo_stack').on(table.inningsId, table.undoStackPos),
  index('idx_delivery_overridden').on(table.isOverridden),
  index('idx_delivery_created_at').on(table.timestamp),
  index('idx_delivery_bowler_innings').on(table.bowlerId, table.inningsId),
]);
