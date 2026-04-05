/**
 * Shared configuration and helpers for k6 load tests.
 *
 * Environment variables (override via k6 --env or -e):
 *   BASE_URL          – API base (default http://localhost:3001)
 *   WS_URL            – WebSocket base (default ws://localhost:3001)
 *   TEST_USER_EMAIL   – scorer account email
 *   TEST_USER_PASSWORD– scorer account password
 */

import http from 'k6/http';
import { check } from 'k6';

// ─── Base URLs ──────────────────────────────────────────────────────────────

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
export const WS_URL = __ENV.WS_URL || 'ws://localhost:3001';
export const API = `${BASE_URL}/api/v1`;

// ─── Test account credentials ───────────────────────────────────────────────

export const TEST_USER = {
  email: __ENV.TEST_USER_EMAIL || 'loadtest@cricscore.dev',
  password: __ENV.TEST_USER_PASSWORD || 'LoadTest123!',
  displayName: 'Load Test Scorer',
};

// ─── Common thresholds ──────────────────────────────────────────────────────

export const DELIVERY_THRESHOLDS = {
  'http_req_duration{type:delivery}': ['p(95)<500'],
  'http_req_failed{type:delivery}': ['rate<0.001'], // 0% tolerance
};

export const SPECTATOR_THRESHOLDS = {
  'http_req_duration{type:scorecard}': ['p(95)<200'],
  'http_req_duration{type:match_detail}': ['p(95)<200'],
  'http_req_duration{type:commentary}': ['p(95)<200'],
  'http_req_failed': ['rate<0.01'],
};

export const STRESS_THRESHOLDS = {
  http_req_duration: ['p(95)<2000'],
  http_req_failed: ['rate<0.01'],
};

// ─── Helper: register + login, return access token ──────────────────────────

/**
 * Register a test user (idempotent — 409 is fine) then login to get a JWT.
 * Returns { accessToken, refreshToken }.
 */
export function authenticate() {
  // Attempt registration (may already exist)
  http.post(
    `${API}/auth/register`,
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
      displayName: TEST_USER.displayName,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const loginRes = http.post(
    `${API}/auth/login`,
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const ok = check(loginRes, {
    'login succeeded': (r) => r.status === 200,
    'access_token present': (r) => {
      try {
        return !!JSON.parse(r.body).access_token;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    console.error(`Auth failed: ${loginRes.status} ${loginRes.body}`);
    return { accessToken: '', refreshToken: '' };
  }

  const body = JSON.parse(loginRes.body);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  };
}

// ─── Helper: authorized headers ─────────────────────────────────────────────

export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── Helper: create two teams with players ──────────────────────────────────

export function createTeamsAndPlayers(token) {
  const headers = authHeaders(token);

  // Create home team
  const homeTeamRes = http.post(
    `${API}/teams`,
    JSON.stringify({ name: `Load Home ${Date.now()}`, shortName: 'LDH' }),
    { headers },
  );
  const homeTeam = JSON.parse(homeTeamRes.body);

  // Create away team
  const awayTeamRes = http.post(
    `${API}/teams`,
    JSON.stringify({ name: `Load Away ${Date.now()}`, shortName: 'LDA' }),
    { headers },
  );
  const awayTeam = JSON.parse(awayTeamRes.body);

  // Create 11 players per team
  const homePlayers = [];
  const awayPlayers = [];

  for (let i = 1; i <= 11; i++) {
    const hp = http.post(
      `${API}/players`,
      JSON.stringify({ firstName: `HomeBat`, lastName: `${i}`, teamId: homeTeam.id }),
      { headers },
    );
    homePlayers.push(JSON.parse(hp.body).id);

    const ap = http.post(
      `${API}/players`,
      JSON.stringify({ firstName: `AwayBowl`, lastName: `${i}`, teamId: awayTeam.id }),
      { headers },
    );
    awayPlayers.push(JSON.parse(ap.body).id);
  }

  return { homeTeam, awayTeam, homePlayers, awayPlayers };
}

// ─── Helper: create a match and start it ────────────────────────────────────

/**
 * Creates a T20 match, starts it (creates first innings), and returns IDs
 * needed for scoring: { matchId, inningsId, homePlayers, awayPlayers,
 * homeTeamId, awayTeamId }.
 */
export function createAndStartMatch(token) {
  const headers = authHeaders(token);
  const { homeTeam, awayTeam, homePlayers, awayPlayers } = createTeamsAndPlayers(token);

  // Create match
  const matchRes = http.post(
    `${API}/matches`,
    JSON.stringify({
      formatConfigId: 't20',
      venue: 'Load Test Stadium',
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homePlayingXi: homePlayers,
      awayPlayingXi: awayPlayers,
    }),
    { headers },
  );

  check(matchRes, { 'match created': (r) => r.status === 201 });
  const matchData = JSON.parse(matchRes.body);

  // Start match (creates 1st innings)
  const startRes = http.post(
    `${API}/matches/${matchData.id}/start`,
    JSON.stringify({
      battingTeamId: homeTeam.id,
      bowlingTeamId: awayTeam.id,
      battingOrder: homePlayers,
    }),
    { headers },
  );

  check(startRes, { 'match started': (r) => r.status === 201 });
  const inningsData = JSON.parse(startRes.body);

  return {
    matchId: matchData.id,
    inningsId: inningsData.id,
    homePlayers,
    awayPlayers,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
  };
}

// ─── Helper: build a realistic delivery payload ─────────────────────────────

let deliveryCounter = 0;

/**
 * Returns a delivery body that cycles through batsmen and bowlers,
 * with realistic run distributions.
 */
export function buildDeliveryPayload(matchCtx) {
  deliveryCounter++;
  const overNum = Math.floor(deliveryCounter / 6);
  const ballInOver = deliveryCounter % 6;

  // Rotate bowler each over
  const bowlerIndex = overNum % matchCtx.awayPlayers.length;
  // Two batsmen at crease, swap strike on odd runs
  const strikerIndex = deliveryCounter % 2 === 0 ? 0 : 1;
  const nonStrikerIndex = strikerIndex === 0 ? 1 : 0;

  // Realistic run distribution: 0 (40%), 1 (30%), 2 (10%), 4 (12%), 6 (5%), wicket (3%)
  const rand = Math.random();
  let runsBatsman = 0;
  let isWicket = false;
  let wicketType = undefined;
  let dismissedPlayerId = undefined;

  if (rand < 0.40) {
    runsBatsman = 0;
  } else if (rand < 0.70) {
    runsBatsman = 1;
  } else if (rand < 0.80) {
    runsBatsman = 2;
  } else if (rand < 0.92) {
    runsBatsman = 4;
  } else if (rand < 0.97) {
    runsBatsman = 6;
  } else {
    runsBatsman = 0;
    isWicket = true;
    wicketType = 'bowled';
    dismissedPlayerId = matchCtx.homePlayers[strikerIndex];
  }

  return {
    innings_num: 1,
    bowler_id: matchCtx.awayPlayers[bowlerIndex],
    striker_id: matchCtx.homePlayers[strikerIndex],
    non_striker_id: matchCtx.homePlayers[nonStrikerIndex],
    runs_batsman: runsBatsman,
    runs_extras: 0,
    is_wicket: isWicket,
    wicket_type: wicketType,
    dismissed_player_id: dismissedPlayerId,
    client_id: `loadtest-${Date.now()}-${deliveryCounter}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
