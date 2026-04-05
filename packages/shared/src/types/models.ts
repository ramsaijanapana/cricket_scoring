import type {
  MatchFormat,
  MatchStatus,
  InningsStatus,
  TossDecision,
  TeamDesignation,
  TeamType,
  BattingStyle,
  BowlingStyle,
  PlayerRole,
  TeamRole,
  DismissalType,
  ShotType,
  UserRole,
} from './enums';

// ─── Base ────────────────────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Team & Player ───────────────────────────────────────────────────────────

export interface Team extends BaseEntity {
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  country: string | null;
  teamType: TeamType;
}

export interface Player extends BaseEntity {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  battingStyle: BattingStyle | null;
  bowlingStyle: BowlingStyle | null;
  primaryRole: PlayerRole | null;
  profileImage: string | null;
}

export interface PlayerTeamMembership {
  id: string;
  playerId: string;
  teamId: string;
  jerseyNumber: number | null;
  roleInTeam: TeamRole | null;
  joinedAt: string;
  leftAt: string | null;
  isActive: boolean;
}

// ─── Tournament ──────────────────────────────────────────────────────────────

export interface Tournament {
  id: string;
  name: string;
  shortName: string | null;
  season: string | null;
  format: MatchFormat;
  startDate: string | null;
  endDate: string | null;
  organizer: string | null;
  createdAt: string;
}

// ─── Match — context.md section 5.3 ─────────────────────────────────────────

export interface MatchFormatConfig {
  id: string;
  name: string;
  oversPerInnings: number | null;
  inningsPerSide: number;
  maxBowlerOvers: number | null;
  powerplayConfig: PowerplayPhase[] | null;
  hasSuperOver: boolean;
  hasDls: boolean;
  hasFollowOn: boolean;
  ballsPerOver: number;
}

export interface PowerplayPhase {
  name: string;
  startOver: number;
  endOver: number;
  fieldingRestriction: number;
}

export interface Match {
  id: string;
  format: MatchFormat;
  formatConfigId: string;
  teamAId: string;
  teamBId: string;
  tossWinnerId: string | null;
  tossDecision: TossDecision | null;
  venue: string | null;
  venueId: string | null;
  weather: string | null;
  playingConditions: Record<string, any> | null;
  dlsActive: boolean;
  superOverId: string | null;
  result: MatchResult | null;
  status: MatchStatus;
  scheduledAt: string | null;
  tournamentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchResult {
  winner: string | null;
  marginRuns: number | null;
  marginWickets: number | null;
  summary: string;
}

export interface MatchOfficials {
  umpire1?: string;
  umpire2?: string;
  thirdUmpire?: string;
  referee?: string;
}

export interface MatchTeam {
  id: string;
  matchId: string;
  teamId: string;
  designation: TeamDesignation;
  playingXi: string[];
}

// ─── Innings ─────────────────────────────────────────────────────────────────

export interface Innings {
  id: string;
  matchId: string;
  inningsNumber: number;
  battingTeamId: string;
  bowlingTeamId: string;
  isSuperOver: boolean;
  totalRuns: number;
  totalWickets: number;
  totalOvers: number;
  totalExtras: number;
  declared: boolean;
  followOn: boolean;
  allOut: boolean;
  targetScore: number | null;
  dlsPar: number | null;
  status: InningsStatus;
  startedAt: string | null;
  endedAt: string | null;
}

export interface Over {
  id: string;
  inningsId: string;
  overNumber: number;
  bowlerId: string;
  runsConceded: number;
  wicketsTaken: number;
  maidens: boolean;
  legalBalls: number;
  totalBalls: number;
}

// ─── Delivery — context.md section 5.2 (immutable event-source record) ──────

export interface Delivery {
  id: string;
  match_id: string;
  innings_num: 1 | 2 | 3 | 4;
  over_num: number;              // 0-indexed
  ball_num: number;              // 1-indexed within over; >6 = extras
  legal_ball_num: number;        // count of legal deliveries

  bowler_id: string;
  striker_id: string;
  non_striker_id: string;

  // Outcome
  runs_batsman: number;          // 0–6 including overthrows
  runs_extras: number;
  extra_type: 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty' | null;
  total_runs: number;            // computed: runs_batsman + runs_extras
  is_free_hit: boolean;          // true if delivery follows a front-foot no-ball

  // Dismissal
  is_wicket: boolean;
  wicket_type: DismissalType | null;
  dismissed_id: string | null;   // may differ from striker (run out)
  fielder_ids: string[];         // catcher, run-out thrower, etc.
  is_retired_hurt: boolean;

  // Shot & Pitch Tracking (optional, for analytics)
  shot_type: string | null;
  landing_x: number | null;      // pitch map coordinates
  landing_y: number | null;
  wagon_x: number | null;        // wagon wheel endpoint
  wagon_y: number | null;
  pace_kmh: number | null;
  swing_type: string | null;

  // State snapshot (for fast reads without replay)
  innings_score: number;         // cumulative score AFTER this ball
  innings_wickets: number;
  innings_overs: string;         // e.g. "12.4"
  run_rate: number;

  commentary_id: string;
  timestamp: string;             // ISO 8601
  undo_stack_pos: number;        // event-source ordering position

  // Override tracking (immutable corrections)
  is_overridden: boolean;
  override_of_id: string | null;
}

// ─── Commentary — context.md section 5.4 ─────────────────────────────────────

export interface Commentary {
  id: string;
  delivery_id: string;
  match_id: string;
  innings_num: number;
  over_ball: string;             // "14.3"
  text: string;                  // primary commentary text
  text_short: string;            // 1-line summary for ticker
  emoji_text: string | null;     // emoji-enhanced version
  mode: 'auto' | 'manual' | 'assisted';
  language: string;              // ISO 639-1 code
  milestone: string | null;      // 'fifty' | 'hundred' | 'five_wickets' | etc.
  drama_level: 1 | 2 | 3;       // 1=routine, 2=notable, 3=high-drama
  published_at: string;
}

// ─── Partnership — context.md section 5.5 ────────────────────────────────────

export interface Partnership {
  id: string;
  matchId: string;
  inningsNum: number;
  batsman1Id: string;
  batsman2Id: string;
  runs: number;
  balls: number;
  wicketNum: number;             // partnership started after this wicket
  endWicketNum: number | null;
}

// ─── Scorecards ──────────────────────────────────────────────────────────────

export interface BattingScorecard {
  id: string;
  inningsId: string;
  playerId: string;
  teamId: string;
  battingPosition: number;
  runsScored: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number | null;
  minutesBatted: number | null;
  isOut: boolean;
  dismissalType: DismissalType | null;
  dismissedById: string | null;
  fielderId: string | null;
  dismissalText: string | null;
  dots: number;
  singles: number;
  doubles: number;
  triples: number;
  isNotOut: boolean;
  didNotBat: boolean;
}

export interface BowlingScorecard {
  id: string;
  inningsId: string;
  playerId: string;
  teamId: string;
  bowlingPosition: number | null;
  oversBowled: number;
  maidens: number;
  runsConceded: number;
  wicketsTaken: number;
  economyRate: number | null;
  dots: number;
  foursConceded: number;
  sixesConceded: number;
  wides: number;
  noBalls: number;
  extrasConceded: number;
}

// ─── PowerplayWindow — context.md section 5.5 ───────────────────────────────

export interface PowerplayWindow {
  matchId: string;
  inningsNum: number;
  ppNum: number;                 // 1/2/3
  startOver: number;
  endOver: number;
  runs: number;
  wickets: number;
  type: 'mandatory' | 'batting_choice' | 'fielding_choice';
}

// ─── Player Career Stats (ClickHouse) — context.md section 5.5 ──────────────

export interface PlayerCareerStats {
  playerId: string;
  format: MatchFormat;
  matches: number;
  innings: number;
  runs: number;
  avg: number;
  strikeRate: number;
  hundreds: number;
  fifties: number;
  ducks: number;
  wickets: number;
  bowlingAvg: number;
  economy: number;
  catches: number;
  stumpings: number;
  runOuts: number;
}

// ─── DLS State — context.md section 5.1 ─────────────────────────────────────

export interface DLSState {
  matchId: string;
  inningsNum: number;
  parScore: number;
  revisedTarget: number | null;
  resourcesRemaining: number;
  interruptionHistory: Array<{
    oversAtInterruption: string;
    scoreAtInterruption: number;
    oversLost: number;
  }>;
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface MediaTag {
  id: string;
  deliveryId: string | null;
  inningsId: string | null;
  matchId: string;
  mediaType: 'video' | 'image' | 'audio';
  sourceUrl: string;
  thumbnailUrl: string | null;
  startTimestampMs: number | null;
  endTimestampMs: number | null;
  title: string | null;
  description: string | null;
  tags: string[];
  autoGenerated: boolean;
  createdAt: string;
}

// ─── User — context.md section 9 ────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  playerId: string | null;
  teamId: string | null;
  isActive: boolean;
  createdAt: string;
}
