import type { Delivery, Commentary, Partnership } from './models';
import type { DismissalType } from './enums';
import type { ScorecardSnapshot } from './dtos';

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
  shotType?: string | null;
  landingX?: number | null;
  landingY?: number | null;
  wagonX?: number | null;
  wagonY?: number | null;
  paceKmh?: number | null;
  swingType?: string | null;
}

export const WS_EVENTS = {
  delivery: (matchId: string) => `match:${matchId}:delivery`,
  wicket: (matchId: string) => `match:${matchId}:wicket`,
  over: (matchId: string) => `match:${matchId}:over`,
  milestone: (matchId: string) => `match:${matchId}:milestone`,
  prediction: (matchId: string) => `match:${matchId}:prediction`,
  dlsUpdate: (matchId: string) => `match:${matchId}:dls_update`,
  status: (matchId: string) => `match:${matchId}:status`,
} as const;

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
  type: 'fifty' | 'hundred' | 'one_fifty' | 'double_hundred' | 'five_wickets' | 'hat_trick' | 'fastest_fifty' | 'team_hundred' | 'team_two_hundred' | 'team_three_hundred';
  player: { id: string; name: string };
  text: string;
}

export interface PredictionEvent {
  win_prob_a: number;
  win_prob_b: number;
  projected_score_low: number;
  projected_score_high: number;
  model_version?: string;
}

export interface DLSUpdateEvent {
  par_score: number;
  revised_target: number | null;
  resources_remaining: number;
  interruption_count?: number;
}

export interface StatusEvent {
  status: string;
  reason: string;
  dls_interruption?: unknown;
  dls_state?: unknown;
}

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
