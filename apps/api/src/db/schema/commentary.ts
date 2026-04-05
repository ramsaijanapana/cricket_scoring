import { pgTable, uuid, smallint, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { delivery } from './delivery';
import { match } from './match';

/**
 * Commentary — per context.md section 5.4
 *
 * Pipeline: Delivery Event → Context Builder → Template Selector → NLG Engine
 *           → Milestone Detector → Commentary Record → WebSocket Broadcast
 */
export const commentary = pgTable('commentary', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryId: uuid('delivery_id').notNull().references(() => delivery.id),
  matchId: uuid('match_id').notNull().references(() => match.id),

  inningsNum: smallint('innings_num').notNull(),
  overBall: varchar('over_ball', { length: 10 }).notNull(),   // e.g. "14.3"

  text: text('text').notNull(),                                // primary commentary text
  textShort: varchar('text_short', { length: 200 }).notNull(), // 1-line summary for ticker
  emojiText: varchar('emoji_text', { length: 500 }),           // emoji-enhanced version

  mode: varchar('mode', { length: 10 }).notNull().default('auto'),
    // 'auto' | 'manual' | 'assisted'
  language: varchar('language', { length: 5 }).notNull().default('en'),  // ISO 639-1

  milestone: varchar('milestone', { length: 20 }),
    // 'fifty' | 'hundred' | 'five_wickets' | 'hat_trick' | etc.
  dramaLevel: smallint('drama_level').notNull().default(1),    // 1=routine, 2=notable, 3=high-drama

  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_commentary_delivery').on(table.deliveryId),
  index('idx_commentary_match').on(table.matchId),
  index('idx_commentary_milestone').on(table.milestone),
]);
