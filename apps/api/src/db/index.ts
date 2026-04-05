import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema/index';
import { env } from '../config';

const sql = postgres(env.DATABASE_URL, {
  max: env.DB_POOL_MAX,
  idle_timeout: env.DB_IDLE_TIMEOUT,
  connect_timeout: env.DB_CONNECT_TIMEOUT,
});
export const db = drizzle(sql, { schema });

export type Database = typeof db;

/**
 * Transaction-compatible database handle.
 * Use this type for functions that accept either the root `db` or a transaction `tx`.
 */
export type TxOrDb = Database | PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
