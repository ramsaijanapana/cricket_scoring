import { storage } from "./storage";
import type {
  Match,
  Team,
  Player,
  Delivery,
  Innings,
  AppUser,
  BattingScorecard,
  BowlingScorecard,
  Commentary,
} from "@cricket/shared";

// ─── Response types ─────────────────────────────────────────────────────────

interface AuthResponse {
  token: string;
  refreshToken: string;
  user: AppUser;
}

/** Enriched match returned by the API with joined team and score data */
export interface MatchWithTeams extends Match {
  teamA?: Team & { shortName?: string | null };
  teamB?: Team & { shortName?: string | null };
  teamAScore?: {
    totalRuns: number;
    totalWickets: number;
    totalOvers: number;
  };
  teamBScore?: {
    totalRuns: number;
    totalWickets: number;
    totalOvers: number;
  };
}

interface ScorecardResponse {
  match: Match;
  innings: Array<{
    innings: Innings;
    batting: BattingScorecard[];
    bowling: BowlingScorecard[];
  }>;
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total?: number;
}

// ─── Request helper ─────────────────────────────────────────────────────────

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api/v1";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = await storage.getToken();

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ─── API client ─────────────────────────────────────────────────────────────

export const api = {
  // Auth
  register: (data: { email: string; password: string; displayName: string }) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () =>
    request<void>("/auth/logout", { method: "POST" }),
  refreshToken: (refreshToken: string) =>
    request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  // Matches
  getMatches: () => request<MatchWithTeams[]>("/matches"),
  getMatch: (id: string) => request<MatchWithTeams>(`/matches/${id}`),
  createMatch: (data: {
    homeTeamId: string;
    awayTeamId: string;
    formatConfigId: string;
    venue?: string;
    city?: string;
    country?: string;
    scheduledStart?: string;
    tournamentId?: string;
    homePlayingXi?: string[];
    awayPlayingXi?: string[];
    tossWinnerTeamId?: string;
    tossDecision?: string;
  }) =>
    request<Match>("/matches", { method: "POST", body: JSON.stringify(data) }),
  startMatch: (id: string, data: { tossWinnerTeamId: string; tossDecision: string }) =>
    request<Match>(`/matches/${id}/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateMatch: (id: string, data: Partial<Match>) =>
    request<Match>(`/matches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Teams
  getTeams: () => request<Team[]>("/teams"),
  createTeam: (data: { name: string; shortName?: string; country?: string; teamType?: string }) =>
    request<Team>("/teams", { method: "POST", body: JSON.stringify(data) }),

  // Players
  getPlayers: () => request<Player[]>("/players"),
  getPlayer: (id: string) => request<Player>(`/players/${id}`),
  createPlayer: (data: { firstName: string; lastName: string; battingStyle?: string; bowlingStyle?: string; primaryRole?: string }) =>
    request<Player>("/players", { method: "POST", body: JSON.stringify(data) }),

  // Scoring
  recordDelivery: (matchId: string, data: {
    innings_num: number;
    bowler_id: string;
    striker_id: string;
    non_striker_id: string;
    runs_batsman: number;
    runs_extras?: number;
    extra_type?: string | null;
    wicket_type?: string | null;
    dismissed_player_id?: string | null;
    fielder_id?: string | null;
  }) =>
    request<Delivery>(`/matches/${matchId}/deliveries`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  undoDelivery: (matchId: string, inningsId: string) =>
    request<void>(`/matches/${matchId}/deliveries/last`, {
      method: "DELETE",
      body: JSON.stringify({ inningsId }),
    }),
  /** @deprecated Use undoDelivery instead */
  undoLastBall: (matchId: string, inningsId: string) =>
    request<void>(`/matches/${matchId}/deliveries/last`, {
      method: "DELETE",
      body: JSON.stringify({ inningsId }),
    }),
  correctDelivery: (matchId: string, ballId: string, data: Partial<Delivery>) =>
    request<Delivery>(`/matches/${matchId}/deliveries/${ballId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Scorecard & Commentary
  getScorecard: (matchId: string) =>
    request<ScorecardResponse>(`/matches/${matchId}/scorecard`),
  getCommentary: (matchId: string, page = 1) =>
    request<PaginatedResponse<Commentary>>(`/matches/${matchId}/commentary?page=${page}`),

  // Innings
  createInnings: (matchId: string, data: { battingTeamId: string; bowlingTeamId: string; inningsNumber: number }) =>
    request<Innings>(`/matches/${matchId}/innings`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  declareInnings: (matchId: string, inningsId: string) =>
    request<Innings>(`/matches/${matchId}/innings/${inningsId}/declare`, {
      method: "POST",
    }),
  setBowler: (matchId: string, inningsId: string, bowlerId: string) =>
    request<void>(`/matches/${matchId}/innings/${inningsId}/bowler`, {
      method: "POST",
      body: JSON.stringify({ bowlerId }),
    }),

  // Analytics
  getWagonWheel: (matchId: string, params?: Record<string, string>) =>
    request<unknown>(
      `/analytics/matches/${matchId}/wagon-wheel?${new URLSearchParams(params)}`
    ),
  getWormChart: (matchId: string) =>
    request<unknown>(`/analytics/matches/${matchId}/worm-chart`),
  getManhattan: (matchId: string) =>
    request<unknown>(`/analytics/matches/${matchId}/manhattan`),
  getPitchMap: (matchId: string, params?: Record<string, string>) =>
    request<unknown>(
      `/analytics/matches/${matchId}/pitch-map?${new URLSearchParams(params)}`
    ),
  getPartnerships: (matchId: string) =>
    request<unknown>(`/analytics/matches/${matchId}/partnerships`),

  // Predictions
  getPredictions: (matchId: string) =>
    request<unknown>(`/matches/${matchId}/predictions`),
  getDLS: (matchId: string) =>
    request<unknown>(`/matches/${matchId}/dls`),

  // Chat
  getChatRooms: (page = 1) =>
    request<PaginatedResponse<unknown>>(`/chat/rooms?page=${page}`),
  getChatMessages: (roomId: string, page = 1) =>
    request<PaginatedResponse<unknown>>(
      `/chat/rooms/${roomId}/messages?page=${page}`,
    ),
  sendChatMessage: (roomId: string, data: { content: string; messageType?: string; replyToId?: string }) =>
    request<unknown>(`/chat/rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createChatRoom: (data: { type: string; name?: string; memberIds?: string[] }) =>
    request<unknown>("/chat/rooms", { method: "POST", body: JSON.stringify(data) }),
  getDirectRoom: (userId: string) => request<unknown>(`/chat/direct/${userId}`),

  // User profile
  getMyProfile: () => request<AppUser>("/users/me"),
  updateMyProfile: (data: Partial<Pick<AppUser, "displayName" | "email">>) =>
    request<AppUser>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
};
