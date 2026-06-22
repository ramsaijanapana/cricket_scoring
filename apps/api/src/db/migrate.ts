import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const connectionString = env.DATABASE_URL;

/** Resolve migrations next to this script (src/db or dist/db in production). */
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function runMigrations() {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');

  await sql.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
