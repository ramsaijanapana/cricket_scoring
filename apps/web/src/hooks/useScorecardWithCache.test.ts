import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fetchScorecardWithCache } from './useScorecardWithCache';
import { offlineStore } from '../lib/offline-store';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getScorecard: vi.fn(),
  },
}));

describe('fetchScorecardWithCache', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    vi.mocked(api.getScorecard).mockReset();
  });

  it('caches fresh scorecard data from the API', async () => {
    const scorecard = [{ innings: { totalRuns: 100 } }];
    vi.mocked(api.getScorecard).mockResolvedValue(scorecard);

    const result = await fetchScorecardWithCache('match-1');

    expect(result).toEqual({ scorecard, isStale: false, cachedAt: null });
    const cached = await offlineStore.getCachedScorecard('match-1');
    expect(cached?.scorecard).toEqual(scorecard);
  });

  it('falls back to cached scorecard when the API fails', async () => {
    const scorecard = [{ innings: { totalRuns: 88 } }];
    await offlineStore.cacheScorecard('match-1', scorecard);
    vi.mocked(api.getScorecard).mockRejectedValue(new Error('offline'));

    const result = await fetchScorecardWithCache('match-1');

    expect(result.isStale).toBe(true);
    expect(result.scorecard).toEqual(scorecard);
    expect(result.cachedAt).toEqual(expect.any(Number));
  });

  it('throws when the API fails and no cache exists', async () => {
    vi.mocked(api.getScorecard).mockRejectedValue(new Error('offline'));

    await expect(fetchScorecardWithCache('match-1')).rejects.toThrow(
      'Failed to load scorecard',
    );
  });
});
