import { describe, it, expect } from 'vitest';
import type { Commentary } from '@cricket/shared';
import {
  parseOverBall,
  getPhaseForOver,
  filterByPhase,
  mergeCommentaryEntries,
  isValidPhaseParam,
  isValidLangParam,
} from './commentary-utils';

function makeEntry(id: string, overBall: string, publishedAt: string, text = 'run'): Commentary {
  return {
    id,
    deliveryId: `d-${id}`,
    matchId: 'm1',
    inningsNum: 1,
    overBall,
    text,
    textShort: text,
    emojiText: null,
    mode: 'auto',
    language: 'en',
    milestone: null,
    dramaLevel: 1,
    publishedAt,
  };
}

describe('parseOverBall', () => {
  it('converts 1-indexed over.ball to 0-indexed over', () => {
    expect(parseOverBall('1.1')).toBe(0);
    expect(parseOverBall('6.4')).toBe(5);
    expect(parseOverBall('16.2')).toBe(15);
  });
});

describe('getPhaseForOver', () => {
  it('maps T20 overs to phases', () => {
    expect(getPhaseForOver(0)).toBe('powerplay');
    expect(getPhaseForOver(5)).toBe('powerplay');
    expect(getPhaseForOver(6)).toBe('middle');
    expect(getPhaseForOver(14)).toBe('middle');
    expect(getPhaseForOver(15)).toBe('death');
    expect(getPhaseForOver(19)).toBe('death');
    expect(getPhaseForOver(20)).toBeNull();
  });
});

describe('filterByPhase', () => {
  const entries = [
    makeEntry('1', '2.3', '2026-01-01T10:00:00Z'),
    makeEntry('2', '8.1', '2026-01-01T10:01:00Z'),
    makeEntry('3', '17.4', '2026-01-01T10:02:00Z'),
  ];

  it('returns all entries when phase is all', () => {
    expect(filterByPhase(entries, 'all')).toHaveLength(3);
  });

  it('filters powerplay overs', () => {
    expect(filterByPhase(entries, 'powerplay').map((e) => e.id)).toEqual(['1']);
  });

  it('filters middle and death overs', () => {
    expect(filterByPhase(entries, 'middle').map((e) => e.id)).toEqual(['2']);
    expect(filterByPhase(entries, 'death').map((e) => e.id)).toEqual(['3']);
  });
});

describe('mergeCommentaryEntries', () => {
  it('deduplicates by id and sorts newest-first', () => {
    const older = makeEntry('1', '1.1', '2026-01-01T10:00:00Z', 'old');
    const newer = { ...older, text: 'updated', publishedAt: '2026-01-01T10:05:00Z' };
    const other = makeEntry('2', '2.1', '2026-01-01T10:03:00Z');

    const merged = mergeCommentaryEntries([older], [newer, other]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('1');
    expect(merged[0].text).toBe('updated');
    expect(merged[1].id).toBe('2');
  });
});

describe('URL param validators', () => {
  it('validates phase and lang params', () => {
    expect(isValidPhaseParam('powerplay')).toBe(true);
    expect(isValidPhaseParam('all')).toBe(true);
    expect(isValidPhaseParam('invalid')).toBe(false);
    expect(isValidLangParam('hi')).toBe(true);
    expect(isValidLangParam('fr')).toBe(false);
  });
});
