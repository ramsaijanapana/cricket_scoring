import type { Commentary } from '@cricket/shared';

/** T20 default phase boundaries (0-indexed over numbers). */
export const T20_PHASE_RANGES = {
  powerplay: { start: 0, end: 5 },
  middle: { start: 6, end: 14 },
  death: { start: 15, end: 19 },
} as const;

export type CommentaryPhase = keyof typeof T20_PHASE_RANGES;

export const COMMENTARY_PHASES: { value: CommentaryPhase | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'powerplay', label: 'PP' },
  { value: 'middle', label: 'Middle' },
  { value: 'death', label: 'Death' },
];

/** Parse "14.3" → 0-indexed over number 13. */
export function parseOverBall(overBall: string): number {
  const [overPart] = overBall.split('.');
  const over = parseInt(overPart, 10);
  return Number.isFinite(over) && over > 0 ? over - 1 : 0;
}

export function getPhaseForOver(overNum: number): CommentaryPhase | null {
  if (overNum >= T20_PHASE_RANGES.powerplay.start && overNum <= T20_PHASE_RANGES.powerplay.end) {
    return 'powerplay';
  }
  if (overNum >= T20_PHASE_RANGES.middle.start && overNum <= T20_PHASE_RANGES.middle.end) {
    return 'middle';
  }
  if (overNum >= T20_PHASE_RANGES.death.start && overNum <= T20_PHASE_RANGES.death.end) {
    return 'death';
  }
  return null;
}

export function filterByPhase(entries: Commentary[], phase: CommentaryPhase | 'all'): Commentary[] {
  if (phase === 'all') return entries;
  const range = T20_PHASE_RANGES[phase];
  return entries.filter((entry) => {
    const overNum = parseOverBall(entry.overBall);
    return overNum >= range.start && overNum <= range.end;
  });
}

/** Merge commentary arrays, newest-first, deduplicated by id (later entries win). */
export function mergeCommentaryEntries(...sources: Commentary[][]): Commentary[] {
  const map = new Map<string, Commentary>();
  for (const source of sources) {
    for (const entry of source) {
      map.set(entry.id, entry);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function isValidPhaseParam(value: string | null): value is CommentaryPhase | 'all' {
  return value === 'all' || value === 'powerplay' || value === 'middle' || value === 'death';
}

export function isValidLangParam(value: string | null): value is 'en' | 'hi' {
  return value === 'en' || value === 'hi';
}
