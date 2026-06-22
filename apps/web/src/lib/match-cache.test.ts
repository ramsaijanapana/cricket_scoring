import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { MatchDetail } from './api';
import {
  detectScoreConflict,
  normalizeWsScore,
  parseOversDecimal,
  patchCommentaryCache,
  patchMatchCache,
  patchMatchStatus,
} from './match-cache';

const matchId = 'match-1';

const baseMatch: MatchDetail = {
  id: matchId,
  format: 't20',
  formatConfigId: 'fc-1',
  teamAId: 'a',
  teamBId: 'b',
  tossWinnerId: null,
  tossDecision: null,
  venue: null,
  venueId: null,
  weather: null,
  playingConditions: null,
  dlsActive: false,
  superOverId: null,
  result: null,
  status: 'live',
  scheduledAt: null,
  tournamentId: null,
  createdAt: '2026-06-22T10:00:00.000Z',
  updatedAt: '2026-06-22T10:00:00.000Z',
  currentScore: '10/0',
  currentOvers: '1.0',
  innings: [
    {
      id: 'inn-1',
      matchId,
      inningsNumber: 1,
      battingTeamId: 'a',
      bowlingTeamId: 'b',
      isSuperOver: false,
      totalRuns: 10,
      totalWickets: 0,
      totalOvers: 1,
      totalExtras: 0,
      declared: false,
      followOn: false,
      allOut: false,
      targetScore: null,
      dlsPar: null,
      status: 'in_progress',
      startedAt: '2026-06-22T10:00:00.000Z',
      endedAt: null,
    },
  ],
};

describe('match-cache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['match', matchId], baseMatch);
  });

  it('parseOversDecimal converts over.ball strings', () => {
    expect(parseOversDecimal('5.3')).toBeCloseTo(5.5);
    expect(parseOversDecimal(2)).toBe(2);
  });

  it('normalizeWsScore reads snake_case snapshot', () => {
    expect(
      normalizeWsScore({
        scorecard_snapshot: {
          innings_score: 42,
          innings_wickets: 2,
          innings_overs: '5.3',
          run_rate: 7.5,
        },
      }),
    ).toEqual({
      inningsScore: 42,
      inningsWickets: 2,
      inningsOvers: '5.3',
      runRate: 7.5,
    });
  });

  it('normalizeWsScore falls back to delivery fields for wickets', () => {
    expect(
      normalizeWsScore({
        delivery: {
          inningsScore: 55,
          inningsWickets: 3,
          inningsOvers: '8.2',
          runRate: 6.8,
        },
      }),
    ).toEqual({
      inningsScore: 55,
      inningsWickets: 3,
      inningsOvers: '8.2',
      runRate: 6.8,
    });
  });

  it('detectScoreConflict flags backwards overs or score', () => {
    expect(
      detectScoreConflict(
        { totalRuns: 30, totalOvers: '5.0' },
        { inningsScore: 28, inningsWickets: 1, inningsOvers: '4.5', runRate: 6 },
      ),
    ).toBe(true);

    expect(
      detectScoreConflict(
        { totalRuns: 30, totalOvers: '5.0' },
        { inningsScore: 28, inningsWickets: 1, inningsOvers: '5.0', runRate: 6 },
      ),
    ).toBe(true);

    expect(
      detectScoreConflict(
        { totalRuns: 30, totalOvers: '5.0' },
        { inningsScore: 32, inningsWickets: 1, inningsOvers: '5.1', runRate: 6.4 },
      ),
    ).toBe(false);
  });

  it('patchMatchCache updates in-progress innings without refetch', () => {
    const result = patchMatchCache(queryClient, matchId, {
      scorecard_snapshot: {
        innings_score: 14,
        innings_wickets: 1,
        innings_overs: '2.1',
        run_rate: 6.5,
      },
    });

    expect(result).toBe('patched');
    const updated = queryClient.getQueryData<MatchDetail>(['match', matchId]);
    expect(updated?.currentScore).toBe('14/1');
    expect(updated?.currentOvers).toBe('2.1');
    expect(updated?.innings?.[0].totalRuns).toBe(14);
    expect(updated?.innings?.[0].totalWickets).toBe(1);
  });

  it('patchMatchCache returns conflict when snapshot regresses', () => {
    const result = patchMatchCache(queryClient, matchId, {
      scorecard_snapshot: {
        innings_score: 8,
        innings_wickets: 0,
        innings_overs: '0.5',
        run_rate: 9,
      },
    });

    expect(result).toBe('conflict');
    expect(queryClient.getQueryData<MatchDetail>(['match', matchId])?.currentScore).toBe('10/0');
  });

  it('patchMatchStatus updates match status in cache', () => {
    patchMatchStatus(queryClient, matchId, 'innings_break');
    expect(queryClient.getQueryData<MatchDetail>(['match', matchId])?.status).toBe('innings_break');
  });

  it('patchCommentaryCache prepends new entry to page 1', () => {
    queryClient.setQueryData(['commentary', matchId, 1, 'en'], {
      data: [{ id: 'c1', text: 'Dot ball' }],
      page: 1,
      limit: 20,
      hasMore: false,
    });

    const added = patchCommentaryCache(queryClient, matchId, {
      id: 'c2',
      deliveryId: 'd2',
      matchId,
      inningsNum: 1,
      overBall: '1.2',
      text: 'Four!',
      textShort: 'Four',
      emojiText: null,
      mode: 'auto',
      language: 'en',
      milestone: null,
      dramaLevel: 2,
      publishedAt: '2026-06-22T10:05:00.000Z',
    });

    expect(added).toBe(true);
    const page = queryClient.getQueryData<{ data: { id: string }[] }>(['commentary', matchId, 1, 'en']);
    expect(page?.data.map((e) => e.id)).toEqual(['c2', 'c1']);
  });
});
