import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL || 'postgres://cricket:cricket_dev@localhost:5433/cricket_scoring';

const sql = postgres(connectionString, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(sql, { schema });

export type Database = typeof db;

/**
 * Transaction-compatible database handle.
 * Use this type for functions that accept either the root `db` or a transaction `tx`.
 */
export type TxOrDb = Database | PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
