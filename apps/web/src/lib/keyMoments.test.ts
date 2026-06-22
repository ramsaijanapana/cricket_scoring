import { describe, it, expect } from 'vitest';
import {
  buildKeyMomentsFromScorecard,
  buildKeyMomentsFromCommentary,
  buildKeyMomentsFromAudit,
  mergeKeyMoments,
} from './keyMoments';

describe('buildKeyMomentsFromScorecard', () => {
  it('extracts fifties, centuries, five-fers, and fall of wickets', () => {
    const moments = buildKeyMomentsFromScorecard([
      {
        innings: { inningsNumber: 1 },
        batting: [
          { playerId: 'p1', playerName: 'Kohli', runsScored: 82, isOut: true },
          { playerId: 'p2', playerName: 'Rohit', runsScored: 112, isOut: false },
        ],
        bowling: [{ playerId: 'b1', playerName: 'Bumrah', wicketsTaken: 5 }],
        fallOfWickets: [{ wicketNumber: 1, inningsScore: 42, playerName: 'Gill', overNumber: '5.2' }],
      },
    ]);

    expect(moments.some((m) => m.label === 'Fifty' && m.detail?.includes('Kohli'))).toBe(true);
    expect(moments.some((m) => m.label === 'Century' && m.detail?.includes('Rohit'))).toBe(true);
    expect(moments.some((m) => m.label === 'Five-wicket haul')).toBe(true);
    expect(moments.some((m) => m.category === 'wicket')).toBe(true);
  });
});

describe('buildKeyMomentsFromCommentary', () => {
  it('maps commentary milestone tags to key moments', () => {
    const moments = buildKeyMomentsFromCommentary([
      {
        id: 'c1',
        deliveryId: 'd1',
        matchId: 'm1',
        inningsNum: 2,
        overBall: '14.3',
        text: 'What a shot!',
        textShort: 'FOUR!',
        emojiText: null,
        mode: 'auto',
        language: 'en',
        milestone: 'fifty',
        dramaLevel: 3,
        publishedAt: '2026-06-22T10:30:00.000Z',
      },
    ]);

    expect(moments).toHaveLength(1);
    expect(moments[0].label).toBe('Fifty');
    expect(moments[0].inningsNum).toBe(2);
  });
});

describe('buildKeyMomentsFromAudit', () => {
  it('includes undo and correction audit entries', () => {
    const moments = buildKeyMomentsFromAudit([
      {
        id: 'a1',
        action: 'delivery_undone',
        createdAt: '2026-06-22T11:00:00.000Z',
      },
      {
        id: 'a2',
        action: 'delivery_corrected',
        createdAt: '2026-06-22T11:05:00.000Z',
        before: { runsBatsman: 0 },
        after: { runsBatsman: 4 },
      },
    ]);

    expect(moments.map((m) => m.label)).toEqual(['Ball undone', 'Ball corrected']);
    expect(moments[1].detail).toContain('runsBatsman');
  });
});

describe('mergeKeyMoments', () => {
  it('deduplicates by id and sorts timestamped entries newest first', () => {
    const merged = mergeKeyMoments(
      [{ id: 'a', category: 'milestone', label: 'Fifty', sortKey: 1 }],
      [
        { id: 'a', category: 'milestone', label: 'Duplicate', sortKey: 2 },
        {
          id: 'b',
          category: 'audit',
          label: 'Ball undone',
          sortKey: 0,
          timestamp: '2026-06-22T12:00:00.000Z',
        },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('b');
  });
});
