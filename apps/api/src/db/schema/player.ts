import { pgTable, uuid, varchar, text, date, timestamp } from 'drizzle-orm/pg-core';

export const player = pgTable('player', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  dateOfBirth: date('date_of_birth'),
  battingStyle: varchar('batting_style', { length: 20 }),
  bowlingStyle: varchar('bowling_style', { length: 40 }),
  primaryRole: varchar('primary_role', { length: 20 }),
  profileImage: text('profile_image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
