import type { Delivery, Commentary, Partnership } from './models';
import type { DismissalType } from './enums';

// ─── Scoring Input (Scorer → Server) — context.md section 6.2 ───────────────

export interface DeliveryInput {
  matchId: string;
  inningsNum: 1 | 2 | 3 | 4;

  bowlerId: string;
  strikerId: string;
  nonStrikerId: string;

  runsBatsman: number;
  runsExtras: number;
  extraType: 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty' | null;

  isWicket: boolean;
  wicketType?: DismissalType | null;
  dismissedId?: string | null;
  fielderIds?: string[];
  isRetiredHurt?: boolean;
  isDeadBall?: boolean;

  // Optional shot & pitch tracking
  shotType?: string | null;
  landingX?: number | null;
  landingY?: number | null;
  wagonX?: number | null;
  wagonY?: number | null;
  paceKmh?: number | null;
  swingType?: string | null;
}

// ─── WebSocket Events (Server → Client) — context.md section 6.2 ────────────

/**
 * Event names follow pattern: match:{id}:<event_type>
 *
 * match:{id}:delivery    → delivery + scorecard snapshot + commentary
 * match:{id}:wicket      → delivery + wicket detail + commentary + partnership ended
 * match:{id}:over        → over summary + bowler stats + run rate
 * match:{id}:milestone   → milestone type + player + text
 * match:{id}:prediction  → win probabilities + projected scores
 * match:{id}:dls_update  → par score + revised target + resources remaining
 * match:{id}:status      → match status change + reason
 */

export interface DeliveryEvent {
  delivery: Delivery;
  scorecardSnapshot: ScorecardSnapshot;
  commentary: Commentary;
}

export interface WicketEvent {
  delivery: Delivery;
  wicketDetail: {
    wicketType: DismissalType;
    dismissedId: string;
    bowlerId: string;
    fielderIds: string[];
    text: string;
  };
  commentary: Commentary;
  partnershipEnded: Partnership;
}

export interface OverEvent {
  overSummary: {
    overNum: number;
    runs: number;
    wickets: number;
    maidens: boolean;
    extras: number;
  };
  bowlerStats: {
    bowlerId: string;
    overs: number;
    runs: number;
    wickets: number;
    economy: number;
  };
  runRate: number;
}

export interface MilestoneEvent {
  type: 'fifty' | 'hundred' | 'one_fifty' | 'double_hundred' | 'five_wickets' | 'hat_trick' | 'fastest_fifty' | 'team_hundred' | 'team_two_hundred' | 'team_three_hundred';
  player: {
    id: string;
    name: string;
  };
  text: string;
}

export interface PredictionEvent {
  winProbA: number;
  winProbB: number;
  projectedScoreLow: number;
  projectedScoreHigh: number;
}

export interface DLSUpdateEvent {
  parScore: number;
  revisedTarget: number | null;
  resourcesRemaining: number;
}

export interface StatusEvent {
  status: string;
  reason: string;
  /** DLS interruption data (present when status is 'rain_delay') */
  dlsInterruption?: unknown;
  /** DLS calculation state (present when status is 'resumed' with DLS recalculation) */
  dlsState?: unknown;
}

// ─── Scorecard Snapshot (embedded in delivery events) ────────────────────────

export interface ScorecardSnapshot {
  inningsScore: number;
  inningsWickets: number;
  inningsOvers: string;
  runRate: number;
  requiredRunRate: number | null;
  target: number | null;
}

// ─── Socket.IO typed events map ──────────────────────────────────────────────

export interface ServerToClientEvents {
  [key: `match:${string}:delivery`]: (data: DeliveryEvent) => void;
  [key: `match:${string}:wicket`]: (data: WicketEvent) => void;
  [key: `match:${string}:over`]: (data: OverEvent) => void;
  [key: `match:${string}:milestone`]: (data: MilestoneEvent) => void;
  [key: `match:${string}:prediction`]: (data: PredictionEvent) => void;
  [key: `match:${string}:dls_update`]: (data: DLSUpdateEvent) => void;
  [key: `match:${string}:status`]: (data: StatusEvent) => void;
}

export interface ClientToServerEvents {
  joinMatch: (data: { matchId: string }) => void;
  leaveMatch: (data: { matchId: string }) => void;
  submitDelivery: (data: DeliveryInput) => void;
  undoLastBall: (data: { matchId: string }) => void;
}
