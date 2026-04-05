import type { Delivery, Commentary, Partnership } from './models';
import type { DismissalType } from './enums';

// ─── Scoring Input (Scorer → Server) — context.md section 6.2 ───────────────

export interface DeliveryInput {
  match_id: string;
  innings_num: 1 | 2 | 3 | 4;

  bowler_id: string;
  striker_id: string;
  non_striker_id: string;

  runs_batsman: number;
  runs_extras: number;
  extra_type: 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty' | null;

  is_wicket: boolean;
  wicket_type?: DismissalType | null;
  dismissed_id?: string | null;
  fielder_ids?: string[];
  is_retired_hurt?: boolean;

  // Optional shot & pitch tracking
  shot_type?: string | null;
  landing_x?: number | null;
  landing_y?: number | null;
  wagon_x?: number | null;
  wagon_y?: number | null;
  pace_kmh?: number | null;
  swing_type?: string | null;
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
  scorecard_snapshot: ScorecardSnapshot;
  commentary: Commentary;
}

export interface WicketEvent {
  delivery: Delivery;
  wicket_detail: {
    wicket_type: DismissalType;
    dismissed_id: string;
    bowler_id: string;
    fielder_ids: string[];
    text: string;
  };
  commentary: Commentary;
  partnership_ended: Partnership;
}

export interface OverEvent {
  over_summary: {
    over_num: number;
    runs: number;
    wickets: number;
    maidens: boolean;
    extras: number;
  };
  bowler_stats: {
    bowler_id: string;
    overs: number;
    runs: number;
    wickets: number;
    economy: number;
  };
  run_rate: number;
}

export interface MilestoneEvent {
  type: 'fifty' | 'hundred' | 'five_wickets' | 'hat_trick' | 'fastest_fifty' | 'double_hundred';
  player: {
    id: string;
    name: string;
  };
  text: string;
}

export interface PredictionEvent {
  win_prob_a: number;
  win_prob_b: number;
  projected_score_low: number;
  projected_score_high: number;
}

export interface DLSUpdateEvent {
  par_score: number;
  revised_target: number | null;
  resources_remaining: number;
}

export interface StatusEvent {
  status: string;
  reason: string;
}

// ─── Scorecard Snapshot (embedded in delivery events) ────────────────────────

export interface ScorecardSnapshot {
  innings_score: number;
  innings_wickets: number;
  innings_overs: string;
  run_rate: number;
  required_run_rate: number | null;
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
  join_match: (data: { match_id: string }) => void;
  leave_match: (data: { match_id: string }) => void;
  submit_delivery: (data: DeliveryInput) => void;
  undo_last_ball: (data: { match_id: string }) => void;
}
