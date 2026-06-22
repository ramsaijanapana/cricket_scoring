import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { offlineStore } from './offline-store';

const DB_NAME = 'cricket-scoring';

async function getDelivery(id: string) {
  const db = await openDB(DB_NAME, 1);
  try {
    return await db.get('pending_deliveries', id);
  } finally {
    db.close();
  }
}

describe('offlineStore', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  describe('queueDelivery', () => {
    it('stores a pending delivery and returns its id', async () => {
      const payload = { runs: 4, ball_type: 'legal' };
      const id = await offlineStore.queueDelivery('match-1', payload);

      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const entry = await getDelivery(id);
      expect(entry).toMatchObject({
        id,
        matchId: 'match-1',
        payload,
        syncStatus: 'pending',
        retryCount: 0,
      });
      expect(entry?.createdAt).toEqual(expect.any(Number));
    });
  });

  describe('getPendingDeliveries', () => {
    it('returns only pending deliveries', async () => {
      const pendingId = await offlineStore.queueDelivery('match-1', { runs: 1 });
      const syncedId = await offlineStore.queueDelivery('match-2', { runs: 2 });
      await offlineStore.markSynced(syncedId);

      const pending = await offlineStore.getPendingDeliveries();

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(pendingId);
      expect(pending[0].matchId).toBe('match-1');
    });

    it('returns multiple pending deliveries across matches', async () => {
      await offlineStore.queueDelivery('match-a', { runs: 1 });
      await offlineStore.queueDelivery('match-b', { runs: 2 });

      const pending = await offlineStore.getPendingDeliveries();

      expect(pending).toHaveLength(2);
      expect(pending.map((d) => d.matchId).sort()).toEqual(['match-a', 'match-b']);
    });
  });

  describe('markSynced', () => {
    it('removes a delivery from the pending queue', async () => {
      const id = await offlineStore.queueDelivery('match-1', { runs: 6 });

      await offlineStore.markSynced(id);

      expect(await offlineStore.getPendingDeliveries()).toHaveLength(0);

      const entry = await getDelivery(id);
      expect(entry?.syncStatus).toBe('synced');
    });
  });

  describe('markFailed', () => {
    it('re-queues failed deliveries while under the retry cap', async () => {
      const id = await offlineStore.queueDelivery('match-1', { runs: 0 });

      for (let attempt = 1; attempt <= 4; attempt++) {
        await offlineStore.markFailed(id);

        const pending = await offlineStore.getPendingDeliveries();
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe(id);
        expect(pending[0].retryCount).toBe(attempt);
        expect(pending[0].syncStatus).toBe('pending');
      }
    });

    it('marks delivery as failed after reaching the retry cap', async () => {
      const id = await offlineStore.queueDelivery('match-1', { runs: 0 });

      for (let attempt = 1; attempt <= 5; attempt++) {
        await offlineStore.markFailed(id);
      }

      expect(await offlineStore.getPendingDeliveries()).toHaveLength(0);

      const entry = await getDelivery(id);
      expect(entry?.syncStatus).toBe('failed');
      expect(entry?.retryCount).toBe(5);
    });
  });

  describe('scorecard cache', () => {
    async function getScorecardEntry(matchId: string) {
      const db = await openDB(DB_NAME, 1);
      try {
        return await db.get('scorecard_cache', matchId);
      } finally {
        db.close();
      }
    }

    it('stores and retrieves a cached scorecard with timestamp', async () => {
      const scorecard = [{ innings: { totalRuns: 120, totalWickets: 3 } }];
      await offlineStore.cacheScorecard('match-1', scorecard);

      const cached = await offlineStore.getCachedScorecard('match-1');

      expect(cached?.scorecard).toEqual(scorecard);
      expect(cached?.cachedAt).toEqual(expect.any(Number));

      const entry = await getScorecardEntry('match-1');
      expect(entry?.matchId).toBe('match-1');
    });

    it('returns null when no scorecard is cached', async () => {
      expect(await offlineStore.getCachedScorecard('missing')).toBeNull();
    });

    it('overwrites an existing cached scorecard', async () => {
      await offlineStore.cacheScorecard('match-1', [{ innings: { totalRuns: 50 } }]);
      await offlineStore.cacheScorecard('match-1', [{ innings: { totalRuns: 75 } }]);

      const cached = await offlineStore.getCachedScorecard('match-1');
      expect(cached?.scorecard).toEqual([{ innings: { totalRuns: 75 } }]);
    });
  });
});
