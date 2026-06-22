import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema/index';
import { env } from '../config';
import { recordDbQuery } from '../middleware/apm';

export { trackQuery } from '../middleware/apm';

function summarizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Wrap postgres.js PendingQuery so completion records DB duration via APM.
 * Drizzle executes queries through client.unsafe(), including .values() chains.
 */
function wrapPendingQuery<T extends readonly postgres.MaybeRow[]>(
  pending: postgres.PendingQuery<T>,
  query: string,
): postgres.PendingQuery<T> {
  const start = performance.now();
  let recorded = false;

  const record = () => {
    if (recorded) return;
    recorded = true;
    recordDbQuery(performance.now() - start, summarizeQuery(query));
  };

  return new Proxy(pending, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        const originalThen = Reflect.get(target, prop, receiver) as postgres.PendingQuery<T>['then'];
        return (onFulfilled?: Parameters<typeof originalThen>[0], onRejected?: Parameters<typeof originalThen>[1]) =>
          originalThen.call(target, onFulfilled, onRejected).finally(record);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        if (result != null && typeof (result as Promise<unknown>).finally === 'function') {
          return (result as Promise<unknown>).finally(record);
        }
        return result;
      };
    },
  }) as postgres.PendingQuery<T>;
}

/**
 * Instrument the postgres.js client so every Drizzle query is timed via recordDbQuery.
 */
function instrumentPostgres(client: postgres.Sql): postgres.Sql {
  const baseUnsafe = client.unsafe.bind(client);

  const instrumented = new Proxy(client, {
    apply(target, thisArg, args) {
      const pending = Reflect.apply(target, thisArg, args) as postgres.PendingQuery<postgres.Row[]>;
      const strings = args[0] as TemplateStringsArray | undefined;
      const query = strings ? strings.join('?') : 'tagged';
      return wrapPendingQuery(pending, query);
    },
    get(target, prop, receiver) {
      if (prop === 'unsafe') {
        return (query: string, parameters?: postgres.ParameterOrJSON<never>[], options?: postgres.UnsafeQueryOptions) =>
          wrapPendingQuery(baseUnsafe(query, parameters, options), query);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as postgres.Sql;

  return instrumented;
}

const sql = instrumentPostgres(
  postgres(env.DATABASE_URL, {
    max: env.DB_POOL_MAX,
    idle_timeout: env.DB_IDLE_TIMEOUT,
    connect_timeout: env.DB_CONNECT_TIMEOUT,
  }),
);

export const db = drizzle(sql, { schema });

export type Database = typeof db;

/**
 * Transaction-compatible database handle.
 * Use this type for functions that accept either the root `db` or a transaction `tx`.
 */
export type TxOrDb = Database | PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
