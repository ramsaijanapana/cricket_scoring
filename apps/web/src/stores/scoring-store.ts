import { create } from 'zustand';
import { normalizeScoreSnapshot, type DeliveryEvent, type WicketEvent } from '@cricket/shared';

export interface ScoringState {
  // Current match context
  matchId: string | null;
  inningsId: string | null;

  // Live state snapshot (from WS events or latest delivery)
  inningsScore: number;
  inningsWickets: number;
  inningsOvers: string;
  runRate: number;
  requiredRunRate: number | null;
  targetScore: number | null;

  // Current participants
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;

  // Recent balls display (this-over tiles)
  recentBalls: BallDisplay[];

  // Sync status
  syncStatus: 'synced' | 'pending' | 'offline';
  pendingCount: number;

  // Actions
  setMatch: (matchId: string, inningsId: string) => void;
  updateFromDelivery: (data: DeliveryEvent | WicketEvent) => void;
  addRecentBall: (ball: BallDisplay) => void;
  clearRecentBalls: () => void;
  setSyncStatus: (status: 'synced' | 'pending' | 'offline', count?: number) => void;
  setParticipants: (striker: string, nonStriker: string, bowler: string) => void;
  reset: () => void;
}

export interface BallDisplay {
  label: string;
  type: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'wide' | 'noball' | 'bye' | 'legbye';
}

const initialState = {
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
  recentBalls: [] as BallDisplay[],
  syncStatus: 'synced' as const,
  pendingCount: 0,
};

export const useScoringStore = create<ScoringState>((set) => ({
  ...initialState,

  setMatch: (matchId, inningsId) =>
    set({ matchId, inningsId, recentBalls: [] }),

  updateFromDelivery: (data) => {
    const snap = normalizeScoreSnapshot(data);
    if (!snap) return;
    set({
      inningsScore: snap.innings_score,
      inningsWickets: snap.innings_wickets,
      inningsOvers: snap.innings_overs,
      runRate: snap.run_rate,
    });
  },

  addRecentBall: (ball) =>
    set((state) => ({
      recentBalls: [...state.recentBalls.slice(-17), ball],
    })),

  clearRecentBalls: () => set({ recentBalls: [] }),

  setSyncStatus: (syncStatus, count) =>
    set({ syncStatus, pendingCount: count ?? 0 }),

  setParticipants: (strikerId, nonStrikerId, bowlerId) =>
    set({ strikerId, nonStrikerId, bowlerId }),

  reset: () => set(initialState),
}));
