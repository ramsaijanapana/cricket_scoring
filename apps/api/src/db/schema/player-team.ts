import { pgTable, uuid, integer, varchar, date, boolean, unique, index } from 'drizzle-orm/pg-core';
import { player } from './player';
import { team } from './team';

export const playerTeamMembership = pgTable('player_team_membership', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => player.id),
  teamId: uuid('team_id').notNull().references(() => team.id),
  jerseyNumber: integer('jersey_number'),
  roleInTeam: varchar('role_in_team', { length: 30 }),
  joinedAt: date('joined_at').notNull(),
  leftAt: date('left_at'),
  isActive: boolean('is_active').notNull().default(true),
}, (table) => [
  unique('uq_player_team_joined').on(table.playerId, table.teamId, table.joinedAt),
  index('idx_ptm_player').on(table.playerId),
  index('idx_ptm_team').on(table.teamId),
]);
