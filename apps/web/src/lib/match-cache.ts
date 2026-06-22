import type { QueryClient } from '@tanstack/react-query';
import type { Commentary, MatchDetail, ScorecardSnapshot } from '@cricket/shared';

/**
 * Cache invalidation map (WS → client cache)
 *
 * | WS event   | Zustand scoring-store | React Query `['match', id]` | React Query `['commentary', id, 1]` |
 * |------------|----------------------|-----------------------------|-------------------------------------|
 * | delivery   | patch (updateFromDelivery) | patch score snapshot   | prepend new entry                   |
 * | wicket     | patch (from delivery fields) | patch score snapshot   | prepend new entry                   |
 * | over       | —                    | invalidate (full refetch)   | —                                   |
 * | status     | —                    | patch status; refetch if completed | —                          |
 * | milestone  | —                    | —                           | —                                   |
 * | prediction | —                    | —                           | —                                   |
 * | dls_update | —                    | —                           | —                                   |
 *
 * Refetch also occurs when patch detects a score/overs conflict (e.g. undo, concurrent scorer).
 */

import { normalizeScoreSnapshot } from '@cricket/shared';

export type PatchResult = 'patched' | 'conflict' | 'noop';

export interface NormalizedScore {
  inningsScore: number;
  inningsWickets: number;
  inningsOvers: string;
  runRate: number;
}

export interface WsDeliveryPayload {
  scorecard_snapshot?: ScorecardSnapshot;
  scorecardSnapshot?: ScorecardSnapshot;
  delivery?: {
    inningsScore?: number;
    inningsWickets?: number;
    inningsOvers?: string;
    runRate?: number;
    id?: string;
  };
  commentary?: Commentary;
}

export function parseOversDecimal(overs: string | number): number {
  if (typeof overs === 'number') return overs;
  const [completed, balls = '0'] = overs.split('.');
  return Number(completed) + Number(balls) / 6;
}

export function normalizeWsScore(payload: WsDeliveryPayload): NormalizedScore | null {
  const snap = normalizeScoreSnapshot(payload);
  if (!snap) return null;
  return {
    inningsScore: snap.innings_score,
    inningsWickets: snap.innings_wickets,
    inningsOvers: snap.innings_overs,
    runRate: snap.run_rate,
  };
}

export function detectScoreConflict(
  cached: { totalRuns: number; totalOvers: number | string },
  incoming: NormalizedScore,
): boolean {
  const cachedOvers = parseOversDecimal(cached.totalOvers);
  const incomingOvers = parseOversDecimal(incoming.inningsOvers);

  if (incomingOvers + 0.001 < cachedOvers) return true;
  if (
    Math.abs(incomingOvers - cachedOvers) < 0.001 &&
    incoming.inningsScore < cached.totalRuns
  ) {
    return true;
  }

  return false;
}

export function patchMatchCache(
  queryClient: QueryClient,
  matchId: string,
  payload: WsDeliveryPayload,
): PatchResult {
  const score = normalizeWsScore(payload);
  if (!score) return 'noop';

  let result: PatchResult = 'patched';

  queryClient.setQueryData<MatchDetail>(['match', matchId], (old) => {
    if (!old?.innings?.length) {
      result = 'noop';
      return old;
    }

    const idx = old.innings.findIndex((i) => i.status === 'in_progress');
    if (idx === -1) {
      result = 'noop';
      return old;
    }

    const current = old.innings[idx];
    if (detectScoreConflict(current, score)) {
      result = 'conflict';
      return old;
    }

    const updatedInnings = [...old.innings];
    updatedInnings[idx] = {
      ...current,
      totalRuns: score.inningsScore,
      totalWickets: score.inningsWickets,
      totalOvers: parseOversDecimal(score.inningsOvers),
    };

    return {
      ...old,
      currentScore: `${score.inningsScore}/${score.inningsWickets}`,
      currentOvers: score.inningsOvers,
      innings: updatedInnings,
    };
  });

  return result;
}

export function patchMatchStatus(
  queryClient: QueryClient,
  matchId: string,
  status: string,
): void {
  queryClient.setQueryData<MatchDetail>(['match', matchId], (old) => {
    if (!old) return old;
    return { ...old, status: status as MatchDetail['status'] };
  });
}

export interface CommentaryPage {
  data: Commentary[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export function patchCommentaryCache(
  queryClient: QueryClient,
  matchId: string,
  entry: Commentary,
  lang: string = 'en',
): boolean {
  let added = false;

  queryClient.setQueryData<CommentaryPage>(['commentary', matchId, 1, lang], (old) => {
    if (!old) return old;
    if (old.data.some((e) => e.id === entry.id)) return old;
    added = true;
    return { ...old, data: [entry, ...old.data] };
  });

  return added;
}

export function refetchMatchCache(queryClient: QueryClient, matchId: string): void {
  queryClient.invalidateQueries({ queryKey: ['match', matchId] });
}
