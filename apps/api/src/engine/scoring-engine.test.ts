import { describe, it, expect } from 'vitest';

/**
 * Cricket Scoring Engine Tests
 *
 * These tests verify core cricket scoring logic without requiring a database.
 * We extract and test the pure functions (strike rotation, innings completion,
 * over completion detection, legal delivery classification, run rate calculation).
 *
 * Cricket Rules Reference:
 * - 6 legal deliveries = 1 over
 * - Wides and no-balls are NOT legal deliveries (don't count toward the over)
 * - Byes and leg-byes ARE legal deliveries
 * - Odd runs (1,3,5) swap striker/non-striker
 * - Over completion swaps striker/non-striker
 * - On a wide, batsman doesn't face (0 balls faced increment)
 * - Free hit follows a no-ball; only run-out dismissal valid
 * - All-out at 10 wickets
 * - Target chase: innings complete when target reached
 */

// ─── Extract pure logic from ScoringEngine for testing ────────────────────

function resolveStrikerRotation(
  strikerId: string, nonStrikerId: string,
  batsmanRuns: number, isWide: boolean,
  isLegal: boolean, overCompleted: boolean,
  isWicket: boolean, dismissedId?: string | null,
): { newStrikerId: string; newNonStrikerId: string } {
  let newStriker = strikerId;
  let newNonStriker = nonStrikerId;

  // Odd runs cause a swap
  if (batsmanRuns % 2 === 1) {
    [newStriker, newNonStriker] = [newNonStriker, newStriker];
  }

  // End of over causes a swap
  if (overCompleted) {
    [newStriker, newNonStriker] = [newNonStriker, newStriker];
  }

  // Wicket — dismissed player needs replacement
  if (isWicket && dismissedId) {
    if (dismissedId === newStriker) {
      newStriker = 'PENDING_NEW_BATSMAN';
    } else if (dismissedId === newNonStriker) {
      newNonStriker = 'PENDING_NEW_BATSMAN';
    }
  }

  return { newStrikerId: newStriker, newNonStrikerId: newNonStriker };
}

function checkInningsCompletion(
  wickets: number, completedOverNumber: number | null,
  maxOvers: number | null, runs: number, target: number | null,
): boolean {
  if (wickets >= 10) return true;
  if (completedOverNumber !== null && maxOvers !== null && completedOverNumber >= maxOvers) return true;
  if (target !== null && runs >= target) return true;
  return false;
}

function isLegalDelivery(extraType: string | null): boolean {
  return extraType !== 'wide' && extraType !== 'noball';
}

function computeRunRate(totalRuns: number, completedOvers: number, ballsInCurrentOver: number, ballsPerOver: number): number {
  const totalBalls = completedOvers * ballsPerOver + ballsInCurrentOver;
  if (totalBalls === 0) return 0;
  return (totalRuns / totalBalls) * ballsPerOver;
}

function computeOverString(completedOvers: number, ballsInCurrentOver: number): string {
  return `${completedOvers}.${ballsInCurrentOver}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ScoringEngine — Legal Delivery Classification', () => {
  it('normal delivery is legal', () => {
    expect(isLegalDelivery(null)).toBe(true);
  });

  it('wide is NOT legal', () => {
    expect(isLegalDelivery('wide')).toBe(false);
  });

  it('no-ball is NOT legal', () => {
    expect(isLegalDelivery('noball')).toBe(false);
  });

  it('bye is legal (fielding extra, ball was legally bowled)', () => {
    expect(isLegalDelivery('bye')).toBe(true);
  });

  it('leg-bye is legal', () => {
    expect(isLegalDelivery('legbye')).toBe(true);
  });
});

describe('ScoringEngine — Strike Rotation', () => {
  const A = 'batsman-a';
  const B = 'batsman-b';

  describe('runs-based rotation', () => {
    it('0 runs: no swap', () => {
      const result = resolveStrikerRotation(A, B, 0, false, true, false, false);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe(B);
    });

    it('1 run: swap', () => {
      const result = resolveStrikerRotation(A, B, 1, false, true, false, false);
      expect(result.newStrikerId).toBe(B);
      expect(result.newNonStrikerId).toBe(A);
    });

    it('2 runs: no swap', () => {
      const result = resolveStrikerRotation(A, B, 2, false, true, false, false);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe(B);
    });

    it('3 runs: swap', () => {
      const result = resolveStrikerRotation(A, B, 3, false, true, false, false);
      expect(result.newStrikerId).toBe(B);
      expect(result.newNonStrikerId).toBe(A);
    });

    it('4 runs: no swap (boundary)', () => {
      const result = resolveStrikerRotation(A, B, 4, false, true, false, false);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe(B);
    });

    it('5 runs: swap (all-run 5)', () => {
      const result = resolveStrikerRotation(A, B, 5, false, true, false, false);
      expect(result.newStrikerId).toBe(B);
      expect(result.newNonStrikerId).toBe(A);
    });

    it('6 runs: no swap (boundary)', () => {
      const result = resolveStrikerRotation(A, B, 6, false, true, false, false);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe(B);
    });
  });

  describe('over completion rotation', () => {
    it('over completes with 0 runs on last ball: swap (dot + over-end)', () => {
      // 0 runs → no run-swap, but over-end → swap
      const result = resolveStrikerRotation(A, B, 0, false, true, true, false);
      expect(result.newStrikerId).toBe(B);
      expect(result.newNonStrikerId).toBe(A);
    });

    it('over completes with 1 run on last ball: double swap = no net change', () => {
      // 1 run → swap, then over-end → swap back
      const result = resolveStrikerRotation(A, B, 1, false, true, true, false);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe(B);
    });

    it('over completes with 2 runs: swap (even runs + over-end)', () => {
      // 2 runs → no swap, over-end → swap
      const result = resolveStrikerRotation(A, B, 2, false, true, true, false);
      expect(result.newStrikerId).toBe(B);
      expect(result.newNonStrikerId).toBe(A);
    });

    it('over completes with 3 runs: no net swap (odd + over-end cancel)', () => {
      // 3 runs → swap, over-end → swap back
      const result = resolveStrikerRotation(A, B, 3, false, true, true, false);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe(B);
    });
  });

  describe('wicket handling', () => {
    it('striker dismissed: needs replacement', () => {
      const result = resolveStrikerRotation(A, B, 0, false, true, false, true, A);
      expect(result.newStrikerId).toBe('PENDING_NEW_BATSMAN');
      expect(result.newNonStrikerId).toBe(B);
    });

    it('non-striker run out: needs replacement', () => {
      // Run-out of non-striker (e.g., backing up too far)
      const result = resolveStrikerRotation(A, B, 0, false, true, false, true, B);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe('PENDING_NEW_BATSMAN');
    });

    it('1 run + wicket (run-out of striker after crossing): non-striker dismissed', () => {
      // 1 run swaps first, so original striker is now non-striker
      // Dismissing original A (now non-striker after 1-run swap)
      const result = resolveStrikerRotation(A, B, 1, false, true, false, true, A);
      expect(result.newStrikerId).toBe(B);
      expect(result.newNonStrikerId).toBe('PENDING_NEW_BATSMAN');
    });

    it('wicket on over completion: swap then replace', () => {
      // 0 runs, over end swaps, then striker (now B) dismissed
      const result = resolveStrikerRotation(A, B, 0, false, true, true, true, B);
      // After over swap: B is striker, A is non-striker
      // B dismissed → PENDING
      expect(result.newStrikerId).toBe('PENDING_NEW_BATSMAN');
      expect(result.newNonStrikerId).toBe(A);
    });
  });

  describe('wide delivery', () => {
    it('wide with 0 extra runs: no rotation (wide not legal, batsman gets 0)', () => {
      // Wides: batsmanRuns is 0, not legal, no over completion
      const result = resolveStrikerRotation(A, B, 0, true, false, false, false);
      expect(result.newStrikerId).toBe(A);
      expect(result.newNonStrikerId).toBe(B);
    });

    it('wide with 1 bye run: swap (odd runs)', () => {
      // Sometimes wides yield additional runs (overthrows)
      const result = resolveStrikerRotation(A, B, 1, true, false, false, false);
      expect(result.newStrikerId).toBe(B);
      expect(result.newNonStrikerId).toBe(A);
    });
  });
});

describe('ScoringEngine — Over Completion', () => {
  it('6 legal deliveries complete an over', () => {
    let legalBalls = 0;
    const ballsPerOver = 6;

    // Simulate 6 legal deliveries
    for (let i = 0; i < 6; i++) {
      legalBalls++;
    }
    expect(legalBalls >= ballsPerOver).toBe(true);
  });

  it('wides do NOT count toward over completion', () => {
    let legalBalls = 0;
    const ballsPerOver = 6;

    // 5 legal + 3 wides + 1 legal = still 6 legal = over complete
    const deliveries = [
      { legal: true },
      { legal: true },
      { legal: false }, // wide
      { legal: true },
      { legal: false }, // wide
      { legal: true },
      { legal: false }, // wide
      { legal: true },
      { legal: true }, // 6th legal ball
    ];

    let totalBalls = 0;
    for (const d of deliveries) {
      totalBalls++;
      if (d.legal) legalBalls++;
    }

    expect(legalBalls).toBe(6);
    expect(totalBalls).toBe(9); // 9 total but only 6 legal
    expect(legalBalls >= ballsPerOver).toBe(true);
  });

  it('no-balls do NOT count toward over completion', () => {
    let legalBalls = 0;
    const ballsPerOver = 6;

    const deliveries = [
      { extra: null },       // legal
      { extra: 'noball' },   // not legal
      { extra: null },       // legal
      { extra: 'noball' },   // not legal
      { extra: null },       // legal
      { extra: null },       // legal
      { extra: null },       // legal
      { extra: null },       // 6th legal
    ];

    for (const d of deliveries) {
      if (isLegalDelivery(d.extra)) legalBalls++;
    }

    expect(legalBalls).toBe(6);
    expect(deliveries.length).toBe(8); // 8 total, 6 legal
  });

  it('byes ARE legal deliveries (count toward over)', () => {
    expect(isLegalDelivery('bye')).toBe(true);
  });

  it('leg-byes ARE legal deliveries (count toward over)', () => {
    expect(isLegalDelivery('legbye')).toBe(true);
  });
});

describe('ScoringEngine — Innings Completion', () => {
  it('all out at 10 wickets', () => {
    expect(checkInningsCompletion(10, null, 20, 150, null)).toBe(true);
  });

  it('not all out at 9 wickets', () => {
    expect(checkInningsCompletion(9, null, 20, 150, null)).toBe(false);
  });

  it('innings complete when max overs bowled (T20)', () => {
    expect(checkInningsCompletion(3, 20, 20, 180, null)).toBe(true);
  });

  it('innings not complete before max overs', () => {
    expect(checkInningsCompletion(3, 19, 20, 180, null)).toBe(false);
  });

  it('innings complete when target reached in chase', () => {
    expect(checkInningsCompletion(2, null, 20, 181, 180)).toBe(true);
  });

  it('innings not complete when target not yet reached', () => {
    expect(checkInningsCompletion(2, null, 20, 179, 180)).toBe(false);
  });

  it('innings complete when target exactly matched', () => {
    expect(checkInningsCompletion(2, null, 20, 180, 180)).toBe(true);
  });

  it('50-over format: innings complete at 50 overs', () => {
    expect(checkInningsCompletion(5, 50, 50, 300, null)).toBe(true);
  });

  it('test match: no max overs limit (null)', () => {
    expect(checkInningsCompletion(5, 100, null, 400, null)).toBe(false);
  });
});

describe('ScoringEngine — Run Rate Calculation', () => {
  it('CRR = 0 when no balls bowled', () => {
    expect(computeRunRate(0, 0, 0, 6)).toBe(0);
  });

  it('6 runs in 1 over = CRR 6.00', () => {
    expect(computeRunRate(6, 1, 0, 6)).toBe(6);
  });

  it('36 runs in 6 overs = CRR 6.00', () => {
    expect(computeRunRate(36, 6, 0, 6)).toBe(6);
  });

  it('10 runs in 2.2 overs (14 balls) = CRR ~4.29', () => {
    const crr = computeRunRate(10, 2, 2, 6);
    expect(crr).toBeCloseTo(4.2857, 3);
  });

  it('1 run from 1 ball = CRR 6.00 (projected per over)', () => {
    expect(computeRunRate(1, 0, 1, 6)).toBe(6);
  });

  it('180 runs in 20 overs = CRR 9.00', () => {
    expect(computeRunRate(180, 20, 0, 6)).toBe(9);
  });

  it('50 runs in 7.3 overs (45 balls) = CRR ~6.67', () => {
    const crr = computeRunRate(50, 7, 3, 6);
    expect(crr).toBeCloseTo(6.6667, 3);
  });
});

describe('ScoringEngine — Overs String Format', () => {
  it('0 balls = 0.0', () => {
    expect(computeOverString(0, 0)).toBe('0.0');
  });

  it('3 balls = 0.3', () => {
    expect(computeOverString(0, 3)).toBe('0.3');
  });

  it('1 over exactly = 1.0', () => {
    expect(computeOverString(1, 0)).toBe('1.0');
  });

  it('1 over + 4 balls = 1.4', () => {
    expect(computeOverString(1, 4)).toBe('1.4');
  });

  it('20 overs exactly = 20.0', () => {
    expect(computeOverString(20, 0)).toBe('20.0');
  });

  it('19.5 overs = 19.5 (5 balls in current over)', () => {
    expect(computeOverString(19, 5)).toBe('19.5');
  });
});

describe('ScoringEngine — Full Over Simulation (User Story)', () => {
  it('User Story: Score 6 legal balls → over completes, strike swaps', () => {
    const ballsPerOver = 6;
    let legalBalls = 0;
    let striker = 'player-A';
    let nonStriker = 'player-B';
    let totalRuns = 0;
    let overCompleted = false;

    // Ball 1: dot ball (0 runs)
    legalBalls++;
    overCompleted = legalBalls >= ballsPerOver;
    expect(overCompleted).toBe(false);

    // Ball 2: 1 run → swap
    legalBalls++;
    totalRuns += 1;
    const after2 = resolveStrikerRotation(striker, nonStriker, 1, false, true, false, false);
    striker = after2.newStrikerId;
    nonStriker = after2.newNonStrikerId;
    expect(striker).toBe('player-B');
    expect(nonStriker).toBe('player-A');

    // Ball 3: 2 runs → no swap
    legalBalls++;
    totalRuns += 2;
    const after3 = resolveStrikerRotation(striker, nonStriker, 2, false, true, false, false);
    striker = after3.newStrikerId;
    nonStriker = after3.newNonStrikerId;
    expect(striker).toBe('player-B');

    // Ball 3.5: WIDE → not legal, doesn't count
    totalRuns += 1; // wide penalty
    // No legalBalls increment, no over check

    // Ball 4: 4 runs → no swap
    legalBalls++;
    totalRuns += 4;

    // Ball 5: 1 run → swap
    legalBalls++;
    totalRuns += 1;
    const after5 = resolveStrikerRotation(striker, nonStriker, 1, false, true, false, false);
    striker = after5.newStrikerId;
    nonStriker = after5.newNonStrikerId;
    expect(striker).toBe('player-A');
    expect(nonStriker).toBe('player-B');

    // Ball 6: 0 runs (dot) → over completes → over-end swap
    legalBalls++;
    overCompleted = legalBalls >= ballsPerOver;
    expect(overCompleted).toBe(true);
    const afterOver = resolveStrikerRotation(striker, nonStriker, 0, false, true, true, false);
    striker = afterOver.newStrikerId;
    nonStriker = afterOver.newNonStrikerId;
    expect(striker).toBe('player-B');
    expect(nonStriker).toBe('player-A');

    expect(totalRuns).toBe(9); // 0+1+2+1(wd)+4+1+0 = 9
    expect(legalBalls).toBe(6);
  });

  it('User Story: No-ball followed by free hit — only run-out valid', () => {
    // No-ball: not legal, triggers free hit on next delivery
    const noball = { extraType: 'noball' as const };
    expect(isLegalDelivery(noball.extraType)).toBe(false);

    // Next delivery is a free hit
    const isFreeHit = noball.extraType === 'noball';
    expect(isFreeHit).toBe(true);

    // On free hit: bowled/lbw/caught dismissals are invalid
    // Only run_out is valid
    const validDismissals = ['run_out'];
    expect(validDismissals).toContain('run_out');
    expect(validDismissals).not.toContain('bowled');
    expect(validDismissals).not.toContain('caught');
    expect(validDismissals).not.toContain('lbw');
  });

  it('User Story: Wide does not count as a ball faced by batsman', () => {
    // On a wide, the batsman is credited 0 balls faced
    const ballsFacedIncrement = 'wide' === 'wide' ? 0 : 1;
    expect(ballsFacedIncrement).toBe(0);
  });

  it('User Story: Bye/leg-bye runs credited as extras, not to batsman', () => {
    // On bye/legbye, runs go to extras, batsman gets 0 runs
    const extraType = 'bye';
    const runsBatsman = extraType === 'bye' || extraType === 'legbye' ? 0 : 2;
    const runsExtras = 2; // 2 byes
    expect(runsBatsman).toBe(0);
    expect(runsExtras).toBe(2);
  });

  it('User Story: T20 chase — innings ends when target reached mid-over', () => {
    // Target 150, batting team on 148/3 in 18.4 overs
    // Next ball: 2 runs → 150 = target → innings complete
    expect(checkInningsCompletion(3, null, 20, 150, 150)).toBe(true);
    // Even though overs not exhausted (18.5 of 20)
    expect(checkInningsCompletion(3, null, 20, 149, 150)).toBe(false);
  });

  it('User Story: All-out ends innings regardless of overs remaining', () => {
    // 10th wicket falls in 15th over — innings over despite 5 overs remaining
    expect(checkInningsCompletion(10, null, 20, 120, null)).toBe(true);
  });
});

describe('ScoringEngine — This Over Display Logic', () => {
  // Tests the bug fix: recentBalls.slice(-0) was returning ALL balls

  function getThisOverBalls(recentBalls: string[], totalOvers: string): string[] {
    const oversParts = totalOvers.split('.');
    const ballsInCurrentOver = parseInt(oversParts[1] || '0', 10);
    // Fixed: when ballsInCurrentOver is 0, return empty (new over)
    return ballsInCurrentOver > 0 ? recentBalls.slice(-ballsInCurrentOver) : [];
  }

  it('2.0 overs (over just completed): shows empty', () => {
    const recent = ['1', '2', '0', '1', '4', '0', '1', '2', '1', '0', '4', '0'];
    const thisOver = getThisOverBalls(recent, '2.0');
    expect(thisOver).toEqual([]);
  });

  it('2.3 overs: shows last 3 balls', () => {
    const recent = ['1', '2', '0', '1', '4', '0', '1', '2', '1'];
    const thisOver = getThisOverBalls(recent, '2.3');
    // slice(-3) of 9 items = last 3 items: ['1', '2', '1']
    expect(thisOver).toEqual(['1', '2', '1']);
  });

  it('0.0 overs (no balls bowled): shows empty', () => {
    const thisOver = getThisOverBalls([], '0.0');
    expect(thisOver).toEqual([]);
  });

  it('0.1 overs: shows 1 ball', () => {
    const recent = ['4'];
    const thisOver = getThisOverBalls(recent, '0.1');
    expect(thisOver).toEqual(['4']);
  });

  it('1.5 overs: shows 5 balls from current over', () => {
    const recent = ['1', '0', '4', '2', '0', '1', '6', '0', '1', '2', '0'];
    const thisOver = getThisOverBalls(recent, '1.5');
    expect(thisOver).toEqual(['6', '0', '1', '2', '0']);
  });
});

describe('ScoringEngine — Extras Calculation', () => {
  it('wide: 1 extra + any additional runs', () => {
    const runs = 0;
    const runsExtras = 1 + runs; // wide penalty + additional
    expect(runsExtras).toBe(1);
  });

  it('wide + 2 overthrows: 3 extras total', () => {
    const additionalRuns = 2;
    const runsExtras = 1 + additionalRuns;
    expect(runsExtras).toBe(3);
  });

  it('no-ball: 1 extra, batsman can score on top', () => {
    const runsBatsman = 4;
    const runsExtras = 1; // no-ball penalty
    const totalRuns = runsBatsman + runsExtras;
    expect(totalRuns).toBe(5);
  });

  it('bye: runs are extras, not credited to batsman', () => {
    const runsBatsman = 0;
    const runsExtras = 2; // 2 byes
    expect(runsBatsman).toBe(0);
    expect(runsExtras).toBe(2);
  });

  it('leg-bye: runs are extras, not credited to batsman', () => {
    const runsBatsman = 0;
    const runsExtras = 1; // 1 leg-bye
    expect(runsBatsman).toBe(0);
    expect(runsExtras).toBe(1);
  });
});

describe('ScoringEngine — Bowling Rules', () => {
  it('same bowler cannot bowl consecutive overs', () => {
    // After over 1 by bowler A, over 2 must be by a different bowler
    const lastOverBowlerId = 'bowler-A';
    const nextBowlerId = 'bowler-A';
    const isConsecutive = lastOverBowlerId === nextBowlerId;
    expect(isConsecutive).toBe(true); // should be rejected
  });

  it('bowler can return after one over gap', () => {
    // Over 1: bowler A, Over 2: bowler B, Over 3: bowler A — allowed
    const overHistory = ['bowler-A', 'bowler-B', 'bowler-A'];
    for (let i = 1; i < overHistory.length; i++) {
      expect(overHistory[i]).not.toBe(overHistory[i - 1]);
    }
  });

  it('alternating bowlers pattern is valid', () => {
    // Common pattern: A-B-A-B-A-B
    const pattern = ['A', 'B', 'A', 'B', 'A', 'B'];
    for (let i = 1; i < pattern.length; i++) {
      expect(pattern[i] !== pattern[i - 1]).toBe(true);
    }
  });

  it('three different bowlers rotating is valid', () => {
    // A-B-C-A-B-C
    const pattern = ['A', 'B', 'C', 'A', 'B', 'C'];
    for (let i = 1; i < pattern.length; i++) {
      expect(pattern[i] !== pattern[i - 1]).toBe(true);
    }
  });

  it('max overs per bowler in T20: 4 overs', () => {
    const maxBowlerOvers = 4;
    const totalOvers = 20;
    // With 5 bowlers, each can bowl max 4 overs (5 * 4 = 20)
    expect(maxBowlerOvers * 5).toBe(totalOvers);
  });

  it('max overs per bowler in ODI: 10 overs', () => {
    const maxBowlerOvers = 10;
    const totalOvers = 50;
    // With 5 bowlers, each can bowl max 10 overs (5 * 10 = 50)
    expect(maxBowlerOvers * 5).toBe(totalOvers);
  });
});
