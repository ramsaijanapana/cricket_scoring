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

/** Normalized auth tokens returned by login/refresh helpers */
export interface AuthResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
}

interface ApiAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

interface ApiMatchTeam {
  teamId: string;
  teamName: string;
  designation: string;
  playingXi?: string[];
  playerNames?: Record<string, string>;
}

interface ApiMatchRaw extends Match {
  teams?: ApiMatchTeam[];
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  currentScore?: string | null;
  currentOvers?: string | null;
  innings?: Array<{
    battingTeamId: string;
    totalRuns: number;
    totalWickets: number;
    totalOvers: string | number;
  }>;
  teamAScore?: MatchWithTeams["teamAScore"];
  teamBScore?: MatchWithTeams["teamBScore"];
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
}

export interface RecordDeliveryInput {
  innings_num: number;
  bowler_id: string;
  striker_id: string;
  non_striker_id: string;
  runs_batsman: number;
  runs_extras?: number;
  extra_type?: "wide" | "noball" | "bye" | "legbye" | "penalty" | null;
  is_wicket?: boolean;
  wicket_type?:
    | "bowled"
    | "caught"
    | "lbw"
    | "run_out"
    | "stumped"
    | "hit_wicket"
    | "obstructing"
    | "timed_out"
    | "handled_ball"
    | "retired_hurt"
    | null;
  dismissed_player_id?: string | null;
  fielder_id?: string | null;
  is_dead_ball?: boolean;
  expected_stack_pos?: number;
  client_id?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    total?: number;
    totalPages?: number;
  };
}

function normalizeAuthResponse(raw: ApiAuthResponse): AuthResponse {
  return {
    token: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresIn: raw.expires_in ?? 3600,
  };
}

function parseScoreString(score: string | null | undefined) {
  if (!score) return undefined;
  const match = String(score).match(/^(\d+)\/(\d+)/);
  if (!match) return undefined;
  return {
    totalRuns: parseInt(match[1], 10),
    totalWickets: parseInt(match[2], 10),
  };
}

function toTeamScore(
  runs: number,
  wickets: number,
  overs: string | number | null | undefined,
): NonNullable<MatchWithTeams["teamAScore"]> {
  return {
    totalRuns: runs,
    totalWickets: wickets,
    totalOvers:
      typeof overs === "string" ? parseFloat(overs) || 0 : (overs ?? 0),
  };
}

function normalizeMatch(raw: ApiMatchRaw): MatchWithTeams {
  const teams = raw.teams ?? [];
  const home = teams.find((t) => t.designation === "home");
  const away = teams.find((t) => t.designation === "away");

  const teamA: MatchWithTeams["teamA"] = {
    id: home?.teamId ?? raw.homeTeamId ?? "",
    name: home?.teamName ?? raw.homeTeamName ?? "Team A",
    shortName: null,
  };
  const teamB: MatchWithTeams["teamB"] = {
    id: away?.teamId ?? raw.awayTeamId ?? "",
    name: away?.teamName ?? raw.awayTeamName ?? "Team B",
    shortName: null,
  };

  let teamAScore = raw.teamAScore;
  let teamBScore = raw.teamBScore;

  if (raw.innings?.length) {
    for (const inn of raw.innings) {
      const score = toTeamScore(
        inn.totalRuns,
        inn.totalWickets,
        inn.totalOvers,
      );
      if (inn.battingTeamId === teamA?.id) teamAScore = score;
      else if (inn.battingTeamId === teamB?.id) teamBScore = score;
    }
  } else if (raw.currentScore) {
    const parsed = parseScoreString(raw.currentScore);
    if (parsed) {
      const liveScore = {
        ...parsed,
        totalOvers: parseFloat(String(raw.currentOvers ?? "0")) || 0,
      };
      if (!teamAScore && !teamBScore) {
        teamAScore = liveScore;
      }
    }
  }

  return { ...raw, teamA, teamB, teamAScore, teamBScore };
}

function unwrapPaginated<T>(payload: T[] | PaginatedResponse<T>): T[] {
  if (Array.isArray(payload)) return payload;
  return payload.data ?? [];
}

function parseApiError(body: Record<string, unknown>, status: number): string {
  const errPayload = body.error;
  if (typeof errPayload === "string") return errPayload;
  if (errPayload && typeof errPayload === "object" && "message" in errPayload) {
    const message = (errPayload as { message?: string }).message;
    if (message) return message;
  }
  if (typeof body.message === "string") return body.message;
  return `API error: ${status}`;
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
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(parseApiError(body, res.status));
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ─── API client ─────────────────────────────────────────────────────────────

export const api = {
  // Auth
  register: (data: { email: string; password: string; displayName: string }) =>
    request<{ user: AppUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: async (data: { email: string; password: string }) => {
    const raw = await request<ApiAuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return normalizeAuthResponse(raw);
  },
  logout: async () => {
    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) return;
    await request<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },
  refreshToken: async (refreshToken: string) => {
    const raw = await request<ApiAuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return normalizeAuthResponse(raw);
  },

  // Matches
  getMatches: async () => {
    const raw = await request<MatchWithTeams[] | PaginatedResponse<ApiMatchRaw>>(
      "/matches",
    );
    return unwrapPaginated(raw).map(normalizeMatch);
  },
  getMatch: async (id: string) => {
    const raw = await request<ApiMatchRaw>(`/matches/${id}`);
    return normalizeMatch(raw);
  },
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
  recordDelivery: (matchId: string, data: RecordDeliveryInput) =>
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
    request<InningsScorecard[]>(`/matches/${matchId}/scorecard`),
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
