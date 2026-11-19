import { describe, it, expect } from 'vitest';
import { resolveChaseTarget } from './chase-target';

describe('resolveChaseTarget', () => {
  it('sets a limited-overs chase to the first innings total plus one', () => {
    expect(resolveChaseTarget({
      nextInningsNumber: 2,
      inningsPerSide: 1,
      firstInningsRuns: 167,
    })).toBe(168);
  });

  it('uses a DLS revised target instead of the raw first-innings total', () => {
    expect(resolveChaseTarget({
      nextInningsNumber: 2,
      inningsPerSide: 1,
      firstInningsRuns: 167,
      revisedTarget: 142,
    })).toBe(142);
  });

  it('keeps a target the scorer sent explicitly', () => {
    expect(resolveChaseTarget({
      nextInningsNumber: 2,
      inningsPerSide: 1,
      requestedTarget: 150,
      firstInningsRuns: 167,
      revisedTarget: 142,
    })).toBe(150);
  });

  it('does not invent a target for the second innings of a multi-day match', () => {
    expect(resolveChaseTarget({
      nextInningsNumber: 2,
      inningsPerSide: 2,
      firstInningsRuns: 400,
    })).toBeNull();
  });

  it('does not invent a target when the format is unknown', () => {
    expect(resolveChaseTarget({
      nextInningsNumber: 2,
      inningsPerSide: 0,
      firstInningsRuns: 167,
    })).toBeNull();
  });
});
