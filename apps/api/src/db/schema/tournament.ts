import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';

export const tournament = pgTable('tournament', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 300 }).notNull(),
  shortName: varchar('short_name', { length: 30 }),
  season: varchar('season', { length: 20 }),
  format: varchar('format', { length: 20 }).notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  organizer: varchar('organizer', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
