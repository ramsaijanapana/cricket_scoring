const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
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

export const api = {
  // Matches
  getMatches: () => request<any[]>('/matches'),
  getMatch: (id: string) => request<any>(`/matches/${id}`),
  createMatch: (data: any) => request<any>('/matches', { method: 'POST', body: JSON.stringify(data) }),
  startMatch: (id: string, data: any) =>
    request<any>(`/matches/${id}/start`, { method: 'POST', body: JSON.stringify(data) }),
  updateMatch: (id: string, data: any) =>
    request<any>(`/matches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Teams
  getTeams: () => request<any[]>('/teams'),
  createTeam: (data: any) => request<any>('/teams', { method: 'POST', body: JSON.stringify(data) }),

  // Players
  getPlayers: () => request<any[]>('/players'),
  getPlayer: (id: string) => request<any>(`/players/${id}`),
  createPlayer: (data: any) => request<any>('/players', { method: 'POST', body: JSON.stringify(data) }),

  // Scoring
  recordDelivery: (matchId: string, data: any) =>
    request<any>(`/matches/${matchId}/deliveries`, { method: 'POST', body: JSON.stringify(data) }),
  undoLastBall: (matchId: string, inningsId: string) =>
    request<any>(`/matches/${matchId}/deliveries/last`, {
      method: 'DELETE',
      body: JSON.stringify({ inningsId }),
    }),
  correctDelivery: (matchId: string, ballId: string, data: any) =>
    request<any>(`/matches/${matchId}/deliveries/${ballId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Scorecard & Commentary
  getScorecard: (matchId: string) => request<any>(`/matches/${matchId}/scorecard`),
  getCommentary: (matchId: string, page = 1) =>
    request<any>(`/matches/${matchId}/commentary?page=${page}`),

  // Innings
  createInnings: (matchId: string, data: any) =>
    request<any>(`/matches/${matchId}/innings`, { method: 'POST', body: JSON.stringify(data) }),
  declareInnings: (matchId: string, inningsId: string) =>
    request<any>(`/matches/${matchId}/innings/${inningsId}/declare`, { method: 'POST' }),
  setBowler: (matchId: string, inningsId: string, bowlerId: string) =>
    request<any>(`/matches/${matchId}/innings/${inningsId}/bowler`, {
      method: 'POST',
      body: JSON.stringify({ bowlerId }),
    }),

  // Analytics
  getWagonWheel: (matchId: string, params?: Record<string, string>) =>
    request<any>(`/analytics/matches/${matchId}/wagon-wheel?${new URLSearchParams(params)}`),
  getWormChart: (matchId: string) =>
    request<any>(`/analytics/matches/${matchId}/worm-chart`),
  getManhattan: (matchId: string) =>
    request<any>(`/analytics/matches/${matchId}/manhattan`),
  getPitchMap: (matchId: string, params?: Record<string, string>) =>
    request<any>(`/analytics/matches/${matchId}/pitch-map?${new URLSearchParams(params)}`),
  getPartnerships: (matchId: string) =>
    request<any>(`/analytics/matches/${matchId}/partnerships`),

  // Predictions
  getPredictions: (matchId: string) =>
    request<any>(`/matches/${matchId}/predictions`),
  getDLS: (matchId: string) =>
    request<any>(`/matches/${matchId}/dls`),
};
