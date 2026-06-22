import * as SQLite from "expo-sqlite";
import * as Network from "expo-network";
import { Alert } from "react-native";
import { api, ApiError, type RecordDeliveryInput } from "./api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendingDelivery {
  id: number;
  matchId: string;
  payload: string;
  createdAt: string;
  synced: number; // 0 or 1
}

export interface SyncConflictInfo {
  message: string;
  serverUndoStackPos?: number;
  matchId?: string;
}

export interface SyncResult {
  syncedCount: number;
  conflict?: SyncConflictInfo;
}

export type SyncConflictHandler = (info: SyncConflictInfo) => void;

interface ThisOverBall {
  runs: number;
  isWicket: boolean;
  extraType: RecordDeliveryInput["extra_type"];
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
    CREATE TABLE IF NOT EXISTS match_sync_state (
      matchId TEXT PRIMARY KEY,
      undoStackPos INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

function extractServerUndoStackPos(error: ApiError): number | undefined {
  const details = error.details as
    | { server_state?: { current_undo_stack_pos?: number } }
    | undefined;
  return details?.server_state?.current_undo_stack_pos;
}

function networkStateOnline(state: Network.NetworkState): boolean {
  return (state.isConnected ?? false) && (state.isInternetReachable ?? false);
}

// ─── Undo stack position ────────────────────────────────────────────────────

export async function getUndoStackPos(matchId: string): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ undoStackPos: number }>(
    "SELECT undoStackPos FROM match_sync_state WHERE matchId = ?",
    [matchId],
  );
  return row?.undoStackPos ?? 0;
}

export async function setUndoStackPos(matchId: string, pos: number): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "INSERT INTO match_sync_state (matchId, undoStackPos) VALUES (?, ?) ON CONFLICT(matchId) DO UPDATE SET undoStackPos = excluded.undoStackPos",
    [matchId, pos],
  );
}

export async function refreshUndoStackPos(matchId: string): Promise<number> {
  try {
    const online = await isOnline();
    if (!online) {
      return getUndoStackPos(matchId);
    }

    const deliveries = await api.getDeliveries(matchId);
    const pos = deliveries[0]?.undoStackPos ?? 0;
    await setUndoStackPos(matchId, pos);
    return pos;
  } catch {
    return getUndoStackPos(matchId);
  }
}

// ─── Optimistic scoring ─────────────────────────────────────────────────────

function incrementOvers(currentOvers: string | number, extraType: RecordDeliveryInput["extra_type"]): string {
  if (extraType === "wide" || extraType === "noball") {
    return String(currentOvers ?? "0.0");
  }

  let overs = parseFloat(String(currentOvers ?? "0"));
  const completedOvers = Math.floor(overs);
  const ballsInOver = Math.round((overs - completedOvers) * 10);
  const nextBalls = ballsInOver + 1;

  if (nextBalls >= 6) {
    overs = completedOvers + 1;
  } else {
    overs = completedOvers + nextBalls / 10;
  }

  return overs.toFixed(1);
}

function buildThisOverBall(payload: RecordDeliveryInput): ThisOverBall {
  return {
    runs: (payload.runs_batsman ?? 0) + (payload.runs_extras ?? 0),
    isWicket: payload.is_wicket ?? false,
    extraType: payload.extra_type ?? null,
  };
}

/**
 * Apply a lightweight optimistic update to local match state while offline.
 */
export function applyOptimisticDelivery(match: any, payload: RecordDeliveryInput): any {
  const inningsList = [...(match?.innings ?? [])];
  const innIdx = inningsList.findIndex(
    (inn: any) =>
      inn.inningsNumber === payload.innings_num && inn.status === "in_progress",
  );
  if (innIdx === -1) return match;

  const inn = { ...inningsList[innIdx] };
  const totalRuns =
    (inn.totalRuns ?? 0) + (payload.runs_batsman ?? 0) + (payload.runs_extras ?? 0);
  const totalWickets = (inn.totalWickets ?? 0) + (payload.is_wicket ? 1 : 0);
  const totalOvers = incrementOvers(inn.totalOvers ?? "0.0", payload.extra_type ?? null);

  const battingScorecard = (inn.battingScorecard ?? []).map((entry: any) => {
    if (entry.playerId !== payload.striker_id) return entry;

    const ballsIncrement = payload.extra_type === "wide" ? 0 : 1;
    return {
      ...entry,
      runsScored: (entry.runsScored ?? 0) + (payload.runs_batsman ?? 0),
      ballsFaced: (entry.ballsFaced ?? 0) + ballsIncrement,
      isOut: payload.is_wicket ? true : entry.isOut,
    };
  });

  const bowlingScorecard = (inn.bowlingScorecard ?? []).map((entry: any) => {
    if (entry.playerId !== payload.bowler_id) return entry;

    const runsConceded =
      (entry.runsConceded ?? 0) +
      (payload.runs_batsman ?? 0) +
      (payload.runs_extras ?? 0);

    return {
      ...entry,
      runsConceded,
      wicketsTaken:
        (entry.wicketsTaken ?? 0) + (payload.is_wicket ? 1 : 0),
    };
  });

  inningsList[innIdx] = {
    ...inn,
    totalRuns,
    totalWickets,
    totalOvers,
    battingScorecard,
    bowlingScorecard,
  };

  const thisOver = [...(match?.thisOver ?? []), buildThisOverBall(payload)].slice(-6);

  return {
    ...match,
    innings: inningsList,
    thisOver,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Queue a delivery locally when the device is offline.
 */
export async function queueDelivery(
  matchId: string,
  payload: RecordDeliveryInput,
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "INSERT INTO pending_deliveries (matchId, payload, createdAt, synced) VALUES (?, ?, datetime('now'), 0)",
    [matchId, JSON.stringify(payload)],
  );
}

/**
 * Replay unsynced deliveries to the API in order. Payloads must include
 * client_id and expected_stack_pos for idempotency and conflict detection.
 */
export async function syncPendingDeliveries(
  options: {
    matchId?: string;
    onConflict?: SyncConflictHandler;
  } = {},
): Promise<SyncResult> {
  const database = await getDb();
  const pending = options.matchId
    ? await database.getAllAsync<PendingDelivery>(
        "SELECT * FROM pending_deliveries WHERE synced = 0 AND matchId = ? ORDER BY id ASC",
        [options.matchId],
      )
    : await database.getAllAsync<PendingDelivery>(
        "SELECT * FROM pending_deliveries WHERE synced = 0 ORDER BY id ASC",
      );

  let syncedCount = 0;

  for (const row of pending) {
    try {
      const payload = JSON.parse(row.payload) as RecordDeliveryInput;
      const result = await api.recordDelivery(row.matchId, payload);

      await database.runAsync(
        "UPDATE pending_deliveries SET synced = 1 WHERE id = ?",
        [row.id],
      );

      const nextPos =
        result.delivery?.undoStackPos ??
        ((payload.expected_stack_pos ?? 0) + 1);
      await setUndoStackPos(row.matchId, nextPos);
      syncedCount++;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const conflict: SyncConflictInfo = {
          message: error.message,
          serverUndoStackPos: extractServerUndoStackPos(error),
          matchId: row.matchId,
        };

        if (conflict.serverUndoStackPos !== undefined) {
          await setUndoStackPos(row.matchId, conflict.serverUndoStackPos);
        }

        options.onConflict?.(conflict);
        return { syncedCount, conflict };
      }

      console.warn("[offline-sync] Failed to sync delivery:", row.id, error);
      break;
    }
  }

  await database.runAsync(
    "DELETE FROM pending_deliveries WHERE synced = 1 AND createdAt < datetime('now', '-1 day')",
  );

  return { syncedCount };
}

/**
 * Returns the count of deliveries that have not yet been synced.
 */
export async function getPendingCount(matchId?: string): Promise<number> {
  const database = await getDb();
  const result = matchId
    ? await database.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM pending_deliveries WHERE synced = 0 AND matchId = ?",
        [matchId],
      )
    : await database.getFirstAsync<{ count: number }>(
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
    return networkStateOnline(state);
  } catch {
    return false;
  }
}

export function showSyncConflictAlert(message?: string): void {
  Alert.alert(
    "Sync conflict",
    message ??
      "The score was updated elsewhere. Your local queue has been refreshed with the latest server state.",
  );
}

// ─── Auto-sync on reconnection ──────────────────────────────────────────────

let unsubscribe: (() => void) | null = null;
let globalConflictHandler: SyncConflictHandler | undefined;

export function setSyncConflictHandler(handler?: SyncConflictHandler): void {
  globalConflictHandler = handler;
}

/**
 * Start listening for network changes and auto-sync when connectivity returns.
 * Call once at app startup.
 */
export function startAutoSync(onConflict?: SyncConflictHandler): void {
  if (unsubscribe) return;

  if (onConflict) {
    globalConflictHandler = onConflict;
  }

  const handleOnline = async () => {
    const pending = await getPendingCount();
    if (pending === 0) return;

    const result = await syncPendingDeliveries({
      onConflict: (conflict) => {
        showSyncConflictAlert(conflict.message);
        globalConflictHandler?.(conflict);
      },
    });

    if (result.conflict) {
      return;
    }
  };

  const subscription = Network.addNetworkStateListener((state) => {
    if (networkStateOnline(state)) {
      void handleOnline();
    }
  });

  void isOnline().then((online) => {
    if (online) {
      void handleOnline();
    }
  });

  unsubscribe = () => {
    subscription.remove();
  };
}

/**
 * Stop the auto-sync listener.
 */
export function stopAutoSync(): void {
  unsubscribe?.();
  unsubscribe = null;
}
