import type {
  Match,
  Innings,
  Delivery,
  BattingScorecard,
  BowlingScorecard,
} from './models';
import type { DeliverySchemaInput } from '../schemas';

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total?: number;
    totalPages?: number;
  };
}

export interface MatchTeamDetail {
  teamId: string;
  teamName: string;
  designation: string;
  playingXi: string[];
  playerNames?: Record<string, string>;
}

export interface EnrichedInnings extends Innings {
  battingScorecard?: (BattingScorecard & { playerName?: string })[];
  bowlingScorecard?: (BowlingScorecard & { playerName?: string })[];
}

export interface MatchDetail extends Match {
  teams?: MatchTeamDetail[];
  innings?: EnrichedInnings[];
  homeTeamName?: string;
  awayTeamName?: string;
  currentScore?: string | null;
  currentOvers?: string | number | null;
  city?: string;
  resultSummary?: string;
}

export type RecordDeliveryInput = DeliverySchemaInput;

export interface PowerplaySnapshot {
  name: string;
  startOver: number;
  endOver: number;
  fieldingRestriction: number;
}

export interface ScorecardSnapshot {
  innings_score: number;
  innings_wickets: number;
  innings_overs: string;
  run_rate: number;
  required_run_rate?: number | null;
  target?: number | null;
  powerplay?: PowerplaySnapshot | null;
}

export interface RecordDeliveryResult {
  delivery: Delivery;
  commentary: unknown;
  overCompleted: boolean;
  inningsCompleted: boolean;
  matchCompleted: boolean;
  newStrikerId: string;
  newNonStrikerId: string;
  scorecardSnapshot: ScorecardSnapshot;
  powerplay?: PowerplaySnapshot | null;
  idempotent?: boolean;
}

export function normalizeScoreSnapshot(payload: {
  scorecard_snapshot?: ScorecardSnapshot;
  scorecardSnapshot?: ScorecardSnapshot;
  delivery?: Pick<Delivery, 'inningsScore' | 'inningsWickets' | 'inningsOvers' | 'runRate'>;
}): ScorecardSnapshot | null {
  const snap = payload.scorecard_snapshot ?? payload.scorecardSnapshot;
  if (snap) return snap;

  const del = payload.delivery;
  if (del && del.inningsScore != null) {
    return {
      innings_score: del.inningsScore,
      innings_wickets: del.inningsWickets,
      innings_overs: del.inningsOvers,
      run_rate: del.runRate,
    };
  }

  return null;
}
