import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { real } from 'drizzle-orm/pg-core';

export const trendingSnapshot = pgTable('trending_snapshot', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 20 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  score: real('score').notNull(),
  period: varchar('period', { length: 20 }).notNull(),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 100 }),
  ballType: varchar('ball_type', { length: 20 }),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_trending_entity_period').on(table.entityType, table.period, table.computedAt.desc()),
  index('idx_trending_city_entity').on(table.city, table.entityType, table.period),
]);
