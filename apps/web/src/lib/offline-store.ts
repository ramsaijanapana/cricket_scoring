import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'cricket-scoring';
const DB_VERSION = 1;

interface PendingDelivery {
  id: string;
  matchId: string;
  payload: any;
  createdAt: number;
  syncStatus: 'pending' | 'synced' | 'failed';
  retryCount: number;
}

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Offline delivery queue
      if (!db.objectStoreNames.contains('pending_deliveries')) {
        const store = db.createObjectStore('pending_deliveries', { keyPath: 'id' });
        store.createIndex('syncStatus', 'syncStatus');
        store.createIndex('matchId', 'matchId');
      }

      // Cached match states for offline viewing
      if (!db.objectStoreNames.contains('match_cache')) {
        db.createObjectStore('match_cache', { keyPath: 'matchId' });
      }

      // Cached scorecards
      if (!db.objectStoreNames.contains('scorecard_cache')) {
        db.createObjectStore('scorecard_cache', { keyPath: 'matchId' });
      }
    },
  });
}

export const offlineStore = {
  // Queue a delivery for offline sync
  async queueDelivery(matchId: string, payload: any): Promise<string> {
    const db = await getDB();
    const id = crypto.randomUUID();
    const entry: PendingDelivery = {
      id,
      matchId,
      payload,
      createdAt: Date.now(),
      syncStatus: 'pending',
      retryCount: 0,
    };
    await db.put('pending_deliveries', entry);
    return id;
  },

  // Get all pending deliveries
  async getPendingDeliveries(): Promise<PendingDelivery[]> {
    const db = await getDB();
    return db.getAllFromIndex('pending_deliveries', 'syncStatus', 'pending');
  },

  // Mark delivery as synced
  async markSynced(id: string): Promise<void> {
    const db = await getDB();
    const entry = await db.get('pending_deliveries', id);
    if (entry) {
      entry.syncStatus = 'synced';
      await db.put('pending_deliveries', entry);
    }
  },

  // Mark delivery as failed (increment retry)
  async markFailed(id: string): Promise<void> {
    const db = await getDB();
    const entry = await db.get('pending_deliveries', id);
    if (entry) {
      entry.syncStatus = 'failed';
      entry.retryCount += 1;
      // Re-queue if under retry limit
      if (entry.retryCount < 5) {
        entry.syncStatus = 'pending';
      }
      await db.put('pending_deliveries', entry);
    }
  },

  // Cache match state for offline viewing
  async cacheMatchState(matchId: string, state: any): Promise<void> {
    const db = await getDB();
    await db.put('match_cache', { matchId, state, cachedAt: Date.now() });
  },

  // Get cached match state
  async getCachedMatchState(matchId: string): Promise<any | null> {
    const db = await getDB();
    const entry = await db.get('match_cache', matchId);
    return entry?.state ?? null;
  },

  // Cache scorecard
  async cacheScorecard(matchId: string, scorecard: any): Promise<void> {
    const db = await getDB();
    await db.put('scorecard_cache', { matchId, scorecard, cachedAt: Date.now() });
  },

  async getCachedScorecard(matchId: string): Promise<any | null> {
    const db = await getDB();
    const entry = await db.get('scorecard_cache', matchId);
    return entry?.scorecard ?? null;
  },
};
