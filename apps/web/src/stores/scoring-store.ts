import { create } from 'zustand';

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
  updateFromDelivery: (data: DeliveryEventData) => void;
  addRecentBall: (ball: BallDisplay) => void;
  clearRecentBalls: () => void;
  setSyncStatus: (status: 'synced' | 'pending' | 'offline', count?: number) => void;
  setParticipants: (striker: string, nonStriker: string, bowler: string) => void;
}

export interface BallDisplay {
  label: string;
  type: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'wide' | 'noball' | 'bye' | 'legbye';
}

export interface DeliveryEventData {
  delivery: any;
  scorecard_snapshot: {
    innings_score: number;
    innings_wickets: number;
    innings_overs: string;
    run_rate: number;
  };
}

export const useScoringStore = create<ScoringState>((set) => ({
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
  syncStatus: 'synced',
  pendingCount: 0,

  setMatch: (matchId, inningsId) =>
    set({ matchId, inningsId, recentBalls: [] }),

  updateFromDelivery: (data) =>
    set({
      inningsScore: data.scorecard_snapshot.innings_score,
      inningsWickets: data.scorecard_snapshot.innings_wickets,
      inningsOvers: data.scorecard_snapshot.innings_overs,
      runRate: data.scorecard_snapshot.run_rate,
    }),

  addRecentBall: (ball) =>
    set((state) => ({
      recentBalls: [...state.recentBalls.slice(-17), ball],
    })),

  clearRecentBalls: () => set({ recentBalls: [] }),

  setSyncStatus: (syncStatus, count) =>
    set({ syncStatus, pendingCount: count ?? 0 }),

  setParticipants: (strikerId, nonStrikerId, bowlerId) =>
    set({ strikerId, nonStrikerId, bowlerId }),
}));
