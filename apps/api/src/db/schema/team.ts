import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const team = pgTable('team', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  shortName: varchar('short_name', { length: 10 }),
  logoUrl: text('logo_url'),
  country: varchar('country', { length: 100 }),
  teamType: varchar('team_type', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
