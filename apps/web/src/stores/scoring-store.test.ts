import { describe, it, expect, beforeEach } from 'vitest';
import { useScoringStore } from './scoring-store';

const resetState = {
  matchId: null,
  inningsId: null,
  inningsScore: 0,
  inningsWickets: 0,
  inningsOvers: '0.0',
  runRate: 0,
  requiredRunRate: null,
  targetScore: null,
  strikerId: null,
  nonStrikerId: null,
  bowlerId: null,
  recentBalls: [],
  syncStatus: 'synced' as const,
  pendingCount: 0,
};

describe('useScoringStore', () => {
  beforeEach(() => {
    useScoringStore.setState(resetState);
  });

  it('setMatch updates match context and clears recent balls', () => {
    useScoringStore.getState().addRecentBall({ label: '4', type: 'four' });
    useScoringStore.getState().setMatch('match-1', 'innings-1');

    const state = useScoringStore.getState();
    expect(state.matchId).toBe('match-1');
    expect(state.inningsId).toBe('innings-1');
    expect(state.recentBalls).toEqual([]);
  });

  it('updateFromDelivery updates the score snapshot', () => {
    useScoringStore.getState().updateFromDelivery({
      delivery: {},
      scorecard_snapshot: {
        innings_score: 42,
        innings_wickets: 2,
        innings_overs: '5.3',
        run_rate: 7.5,
      },
    });

    const state = useScoringStore.getState();
    expect(state.inningsScore).toBe(42);
    expect(state.inningsWickets).toBe(2);
    expect(state.inningsOvers).toBe('5.3');
    expect(state.runRate).toBe(7.5);
  });

  it('addRecentBall keeps at most 18 balls', () => {
    const { addRecentBall } = useScoringStore.getState();
    for (let i = 0; i < 20; i++) {
      addRecentBall({ label: String(i), type: 'run' });
    }

    const balls = useScoringStore.getState().recentBalls;
    expect(balls).toHaveLength(18);
    expect(balls[0].label).toBe('2');
    expect(balls[17].label).toBe('19');
  });

  it('clearRecentBalls empties the over display', () => {
    useScoringStore.getState().addRecentBall({ label: '1', type: 'run' });
    useScoringStore.getState().clearRecentBalls();

    expect(useScoringStore.getState().recentBalls).toEqual([]);
  });

  it('setSyncStatus updates status and pending count', () => {
    useScoringStore.getState().setSyncStatus('pending', 3);

    const state = useScoringStore.getState();
    expect(state.syncStatus).toBe('pending');
    expect(state.pendingCount).toBe(3);
  });

  it('setParticipants updates striker, non-striker, and bowler', () => {
    useScoringStore.getState().setParticipants('p1', 'p2', 'p3');

    const state = useScoringStore.getState();
    expect(state.strikerId).toBe('p1');
    expect(state.nonStrikerId).toBe('p2');
    expect(state.bowlerId).toBe('p3');
  });

  it('reset clears all state', () => {
    useScoringStore.getState().setMatch('match-1', 'innings-1');
    useScoringStore.getState().updateFromDelivery({
      delivery: {},
      scorecard_snapshot: {
        innings_score: 42,
        innings_wickets: 2,
        innings_overs: '5.3',
        run_rate: 7.5,
      },
    });
    useScoringStore.getState().addRecentBall({ label: '4', type: 'four' });
    useScoringStore.getState().setSyncStatus('pending', 3);
    useScoringStore.getState().setParticipants('p1', 'p2', 'p3');

    useScoringStore.getState().reset();

    expect(useScoringStore.getState()).toMatchObject(resetState);
  });
});
