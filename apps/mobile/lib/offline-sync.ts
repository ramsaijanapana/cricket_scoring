import * as SQLite from "expo-sqlite";
import * as Network from "expo-network";
import { api } from "./api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendingDelivery {
  id: number;
  matchId: string;
  payload: string;
  createdAt: string;
  synced: number; // 0 or 1
}

// ─── Database ───────────────────────────────────────────────────────────────

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("cricscore_offline.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matchId TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Queue a delivery locally when the device is offline.
 */
export async function queueDelivery(
  matchId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "INSERT INTO pending_deliveries (matchId, payload, createdAt, synced) VALUES (?, ?, datetime('now'), 0)",
    [matchId, JSON.stringify(payload)],
  );
}

/**
 * Replay all unsynced deliveries to the API in order, marking each as synced
 * upon success. Returns the number of deliveries successfully synced.
 */
export async function syncPendingDeliveries(): Promise<number> {
  const database = await getDb();
  const pending = await database.getAllAsync<PendingDelivery>(
    "SELECT * FROM pending_deliveries WHERE synced = 0 ORDER BY id ASC",
  );

  let syncedCount = 0;

  for (const row of pending) {
    try {
      const payload = JSON.parse(row.payload);
      await api.recordDelivery(row.matchId, payload);
      await database.runAsync(
        "UPDATE pending_deliveries SET synced = 1 WHERE id = ?",
        [row.id],
      );
      syncedCount++;
    } catch (error) {
      // Stop on first failure to preserve delivery order
      console.warn("[offline-sync] Failed to sync delivery:", row.id, error);
      break;
    }
  }

  // Purge synced rows older than 24 hours
  await database.runAsync(
    "DELETE FROM pending_deliveries WHERE synced = 1 AND createdAt < datetime('now', '-1 day')",
  );

  return syncedCount;
}

/**
 * Returns the count of deliveries that have not yet been synced.
 */
export async function getPendingCount(): Promise<number> {
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM pending_deliveries WHERE synced = 0",
  );
  return result?.count ?? 0;
}

/**
 * Check whether the device currently has network connectivity.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return (state.isConnected ?? false) && (state.isInternetReachable ?? false);
  } catch {
    return false;
  }
}

// ─── Auto-sync on reconnection ──────────────────────────────────────────────

let unsubscribe: (() => void) | null = null;

/**
 * Start listening for network changes and auto-sync when connectivity returns.
 * Call once at app startup.
 */
export function startAutoSync(): void {
  if (unsubscribe) return;

  // Poll network state every 5 seconds when there are pending deliveries
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const check = async () => {
    const online = await isOnline();
    if (online) {
      const pending = await getPendingCount();
      if (pending > 0) {
        await syncPendingDeliveries();
      }
    }
  };

  intervalId = setInterval(check, 5000);

  unsubscribe = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/**
 * Stop the auto-sync listener.
 */
export function stopAutoSync(): void {
  unsubscribe?.();
  unsubscribe = null;
}
