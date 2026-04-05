import type {
  Match,
  Player,
  Team,
  Delivery,
  Innings,
  Commentary,
  DLSState,
  Partnership,
  BattingScorecard,
  BowlingScorecard,
} from '@cricket/shared';

// ─── Extended API response types ────────────────────────────────────────────
// The API returns enriched objects with joined/computed fields beyond the base models.

export interface MatchTeamInfo {
  teamId: string;
  teamName: string;
  designation: string;
  playingXi: string[];
  playerNames?: Record<string, string>;
}

export interface MatchDetail extends Match {
  teams?: MatchTeamInfo[];
  innings?: Innings[];
  homeTeamName?: string;
  awayTeamName?: string;
  currentScore?: string;
  currentOvers?: string;
  city?: string;
  resultSummary?: string;
}

export interface FallOfWicket {
  wicketNumber: number;
  inningsScore: number;
  playerName: string;
  overNumber: string;
}

export interface InningsExtras {
  total: number;
  wides?: number;
  noBalls?: number;
  byes?: number;
  legByes?: number;
  penalties?: number;
}

export interface InningsScorecard {
  innings: Innings;
  batting: (BattingScorecard & { playerName?: string })[];
  bowling: (BowlingScorecard & { playerName?: string })[];
  battingTeamName?: string;
  bowlingTeamName?: string;
  extras: InningsExtras;
  fallOfWickets?: FallOfWicket[];
}

export interface CreateMatchInput {
  formatConfigId: string;
  venue?: string;
  city?: string;
  homeTeamId: string;
  awayTeamId: string;
  homePlayingXi: string[];
  awayPlayingXi: string[];
}

export interface CreateTeamInput {
  name: string;
  shortName?: string;
  teamType: string;
}

export interface WagonWheelPoint {
  deliveryId: string;
  runs: number;
  wagonX: number;
  wagonY: number;
  shotType: string | null;
}

export interface WormChartData {
  inningsNum: number;
  overs: number[];
  runs: number[];
}

export interface ManhattanBar {
  overNumber: number;
  runs: number;
  wickets: number;
}

export interface PitchMapPoint {
  deliveryId: string;
  landingX: number;
  landingY: number;
  runs: number;
  isWicket: boolean;
}

export interface PredictionData {
  winProbability: Record<string, number>;
  projectedScore: number | null;
}

// ─── Tournament types ──────────────────────────────────────────────────────

export interface TournamentDetail {
  id: string;
  name: string;
  shortName?: string;
  season?: string;
  format: string;
  startDate?: string;
  endDate?: string;
  organizer?: string;
  status: 'upcoming' | 'live' | 'completed';
  fixtures?: TournamentFixture[];
  teams?: Team[];
  createdAt: string;
}

export interface TournamentFixture {
  id: string;
  matchNumber?: number;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName: string;
  awayTeamName: string;
  venue?: string;
  city?: string;
  scheduledStart?: string;
  status: string;
  resultSummary?: string;
  currentScore?: string;
  currentOvers?: string;
}

export interface PointsTableEntry {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  noResult: number;
  points: number;
  nrr: number;
}

export interface CreateTournamentInput {
  name: string;
  shortName?: string;
  season?: string;
  format: string;
  startDate?: string;
  endDate?: string;
  organizer?: string;
  teamIds?: string[];
  groupStageConfig?: {
    groups?: number;
    teamsPerGroup?: number;
    pointsForWin?: number;
    pointsForTie?: number;
    pointsForNR?: number;
  };
}

export interface AddFixtureInput {
  homeTeamId: string;
  awayTeamId: string;
  formatConfigId: string;
  matchNumber?: number;
  venue?: string;
  city?: string;
  scheduledStart?: string;
  stage?: string;
}

// ─── GDPR types ────────────────────────────────────────────────────────────

export interface UserExportData {
  exportedAt: string;
  profile: Record<string, unknown>;
  teamsManaged: Team[];
  matchesScored: Array<{
    id: string;
    venue?: string;
    status: string;
    scheduledStart?: string;
    resultSummary?: string;
  }>;
  chatMessages: Array<{
    id: string;
    roomId: string;
    content: string;
    createdAt: string;
  }>;
}

export interface AccountDeletionResponse {
  message: string;
  deletedAt: string;
  hardDeleteDate: string;
  gracePeriodDays: number;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setAuthToken(token: string) {
  localStorage.setItem('access_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('access_token');
}

// ─── Fetch Helper ───────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    // API may return { error: "string" } or { error: { code, message } }
    const errPayload = body.error;
    const message = typeof errPayload === 'string'
      ? errPayload
      : errPayload?.message || `API error: ${res.status}`;
    const code = typeof errPayload === 'object' ? errPayload?.code : undefined;
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const api = {
  // Matches
  getMatches: () => request<MatchDetail[]>('/matches'),
  getMatch: (id: string) => request<MatchDetail>(`/matches/${id}`),
  createMatch: (data: CreateMatchInput) =>
    request<MatchDetail>('/matches', { method: 'POST', body: JSON.stringify(data) }),
  startMatch: (id: string, data: Record<string, unknown>) =>
    request<MatchDetail>(`/matches/${id}/start`, { method: 'POST', body: JSON.stringify(data) }),
  updateMatch: (id: string, data: Partial<MatchDetail>) =>
    request<MatchDetail>(`/matches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Teams
  getTeams: () => request<Team[]>('/teams'),
  createTeam: (data: CreateTeamInput) =>
    request<Team>('/teams', { method: 'POST', body: JSON.stringify(data) }),

  // Players
  getPlayers: () => request<Player[]>('/players'),
  getPlayer: (id: string) => request<Player>(`/players/${id}`),
  createPlayer: (data: Partial<Player>) =>
    request<Player>('/players', { method: 'POST', body: JSON.stringify(data) }),

  // Scoring
  recordDelivery: (matchId: string, data: Partial<Delivery>) =>
    request<Delivery>(`/matches/${matchId}/deliveries`, { method: 'POST', body: JSON.stringify(data) }),
  undoLastBall: (matchId: string, inningsId: string) =>
    request<{ success: boolean }>(`/matches/${matchId}/deliveries/last`, {
      method: 'DELETE',
      body: JSON.stringify({ inningsId }),
    }),
  correctDelivery: (matchId: string, ballId: string, data: Partial<Delivery>) =>
    request<Delivery>(`/matches/${matchId}/deliveries/${ballId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Scorecard & Commentary
  getScorecard: (matchId: string) => request<InningsScorecard[]>(`/matches/${matchId}/scorecard`),
  getCommentary: (matchId: string, page = 1) =>
    request<{ data: Commentary[]; page: number; limit: number; hasMore: boolean }>(
      `/matches/${matchId}/commentary?page=${page}`,
    ),
  updateCommentary: (matchId: string, commentaryId: string, data: { text?: string; text_short?: string }) =>
    request<Commentary>(`/matches/${matchId}/commentary/${commentaryId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Toss
  recordToss: (matchId: string, data: { winner_id: string; decision: 'bat' | 'field' }) =>
    request<MatchDetail>(`/matches/${matchId}/toss`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Innings
  createInnings: (matchId: string, data: Partial<Innings>) =>
    request<Innings>(`/matches/${matchId}/innings`, { method: 'POST', body: JSON.stringify(data) }),
  declareInnings: (matchId: string, inningsId: string) =>
    request<Innings>(`/matches/${matchId}/innings/${inningsId}/declare`, { method: 'POST' }),
  setBowler: (matchId: string, inningsId: string, bowlerId: string) =>
    request<Innings>(`/matches/${matchId}/innings/${inningsId}/bowler`, {
      method: 'POST',
      body: JSON.stringify({ bowlerId }),
    }),

  // Analytics
  getWagonWheel: (matchId: string, params?: Record<string, string>) =>
    request<WagonWheelPoint[]>(`/analytics/matches/${matchId}/wagon-wheel?${new URLSearchParams(params)}`),
  getWormChart: (matchId: string) =>
    request<WormChartData[]>(`/analytics/matches/${matchId}/worm-chart`),
  getManhattan: (matchId: string) =>
    request<ManhattanBar[]>(`/analytics/matches/${matchId}/manhattan`),
  getPitchMap: (matchId: string, params?: Record<string, string>) =>
    request<PitchMapPoint[]>(`/analytics/matches/${matchId}/pitch-map?${new URLSearchParams(params)}`),
  getPartnerships: (matchId: string) =>
    request<Partnership[]>(`/analytics/matches/${matchId}/partnerships`),

  // Predictions
  getPredictions: (matchId: string) =>
    request<PredictionData>(`/matches/${matchId}/predictions`),
  getDLS: (matchId: string) =>
    request<DLSState>(`/matches/${matchId}/dls`),

  // Tournaments
  getTournaments: (status?: string) =>
    request<{ data: TournamentDetail[] }>(`/tournaments${status ? `?status=${status}` : ''}`),
  getTournament: (id: string) =>
    request<TournamentDetail>(`/tournaments/${id}`),
  createTournament: (data: CreateTournamentInput) =>
    request<TournamentDetail>('/tournaments', { method: 'POST', body: JSON.stringify(data) }),
  addFixture: (tournamentId: string, data: AddFixtureInput) =>
    request<Match>(`/tournaments/${tournamentId}/fixtures`, { method: 'POST', body: JSON.stringify(data) }),
  getPointsTable: (tournamentId: string) =>
    request<{ pointsTable: PointsTableEntry[] }>(`/tournaments/${tournamentId}/points-table`),

  // Scorer assignment
  assignScorer: (matchId: string, userId: string) =>
    request<{ scorers: string[] }>(`/matches/${matchId}/scorers`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  revokeScorer: (matchId: string, userId: string) =>
    request<void>(`/matches/${matchId}/scorers/${userId}`, { method: 'DELETE' }),

  // GDPR / Settings
  exportUserData: () =>
    request<UserExportData>('/users/me/export'),
  deleteAccount: (confirmation: string) =>
    request<AccountDeletionResponse>('/users/me', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
  reactivateAccount: () =>
    request<Record<string, unknown>>('/users/me/reactivate', { method: 'POST' }),
};
