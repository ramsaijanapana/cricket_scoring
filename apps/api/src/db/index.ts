import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL || 'postgres://cricket:cricket_dev@localhost:5432/cricket_scoring';

const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });

export type Database = typeof db;
