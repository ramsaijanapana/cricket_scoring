import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { offlineStore } from '../lib/offline-store';

export interface ScorecardQueryResult {
  scorecard: any[];
  isStale: boolean;
  cachedAt: number | null;
}

async function fetchScorecardWithCache(matchId: string): Promise<ScorecardQueryResult> {
  try {
    const scorecard = await api.getScorecard(matchId);
    await offlineStore.cacheScorecard(matchId, scorecard);
    return { scorecard, isStale: false, cachedAt: null };
  } catch {
    const cached = await offlineStore.getCachedScorecard(matchId);
    if (!cached?.scorecard?.length) {
      throw new Error('Failed to load scorecard');
    }
    return {
      scorecard: cached.scorecard,
      isStale: true,
      cachedAt: cached.cachedAt,
    };
  }
}

export function useScorecardWithCache(matchId: string | undefined) {
  return useQuery({
    queryKey: ['scorecard', matchId],
    queryFn: () => fetchScorecardWithCache(matchId!),
    enabled: !!matchId,
  });
}

export { fetchScorecardWithCache };
