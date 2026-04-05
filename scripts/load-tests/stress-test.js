/**
 * Combined Stress Test
 *
 * Ramps from 10 to 500 virtual users over 5 minutes with a mixed workload:
 *   - Scoring scenario: 5% of VUs submit deliveries (write-heavy)
 *   - Spectating scenario: 85% of VUs read scorecards/match data
 *   - WebSocket scenario: 10% of VUs hold WebSocket connections
 *
 * Goal: find the breaking point — when error rate > 1% or p95 > 2s.
 *
 * Run:
 *   k6 run scripts/load-tests/stress-test.js
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import {
  API,
  WS_URL,
  authenticate,
  authHeaders,
  createAndStartMatch,
  STRESS_THRESHOLDS,
} from './config.js';

// ─── Custom metrics ─────────────────────────────────────────────────────────

const deliveryLatency = new Trend('stress_delivery_latency', true);
const readLatency = new Trend('stress_read_latency', true);
const wsLatency = new Trend('stress_ws_connect_latency', true);
const errorRate = new Rate('stress_error_rate');
const totalRequests = new Counter('stress_total_requests');

// ─── k6 options ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Scorers — write-heavy, small count
    scorers: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '1m', target: 15 },
        { duration: '1m', target: 25 },
        { duration: '1m', target: 25 },   // sustain peak
        { duration: '1m', target: 0 },
      ],
      exec: 'scorerScenario',
      gracefulRampDown: '10s',
    },

    // Spectators — read-heavy, bulk of traffic
    spectators: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 425 },
        { duration: '1m', target: 425 },  // sustain peak
        { duration: '1m', target: 0 },
      ],
      exec: 'spectatorScenario',
      gracefulRampDown: '10s',
    },

    // WebSocket connections
    websocket_viewers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '1m', target: 25 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 50 },   // sustain
        { duration: '1m', target: 0 },
      ],
      exec: 'websocketScenario',
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ...STRESS_THRESHOLDS,
    stress_delivery_latency: ['p(95)<2000', 'p(99)<5000'],
    stress_read_latency: ['p(95)<2000', 'p(99)<5000'],
    stress_error_rate: ['rate<0.01'],
  },
};

// ─── Setup ──────────────────────────────────────────────────────────────────

export function setup() {
  const auth = authenticate();
  if (!auth.accessToken) {
    throw new Error('Setup failed: could not authenticate');
  }

  const matchCtx = createAndStartMatch(auth.accessToken);
  const headers = authHeaders(auth.accessToken);

  // Seed a few deliveries so reads have data
  for (let i = 0; i < 12; i++) {
    const overNum = Math.floor(i / 6);
    const bowlerIndex = overNum % matchCtx.awayPlayers.length;

    http.post(
      `${API}/matches/${matchCtx.matchId}/deliveries`,
      JSON.stringify({
        innings_num: 1,
        bowler_id: matchCtx.awayPlayers[bowlerIndex],
        striker_id: matchCtx.homePlayers[i % 2 === 0 ? 0 : 1],
        non_striker_id: matchCtx.homePlayers[i % 2 === 0 ? 1 : 0],
        runs_batsman: [0, 1, 4, 1, 2, 0][i % 6],
        runs_extras: 0,
        is_wicket: false,
        client_id: `stress-setup-${i}-${Date.now()}`,
      }),
      { headers },
    );
  }

  console.log(`Stress test setup: matchId=${matchCtx.matchId}`);

  return {
    accessToken: auth.accessToken,
    matchId: matchCtx.matchId,
    inningsId: matchCtx.inningsId,
    homePlayers: matchCtx.homePlayers,
    awayPlayers: matchCtx.awayPlayers,
  };
}

// ─── Scenario: Scorers (write) ──────────────────────────────────────────────

export function scorerScenario(data) {
  const headers = authHeaders(data.accessToken);
  const iter = __ITER;
  const vuId = __VU;

  const overNum = Math.floor(iter / 6);
  const bowlerIndex = (overNum + vuId) % data.awayPlayers.length;
  const strikerIndex = iter % 2 === 0 ? 0 : 1;

  // Run distribution
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
    isWicket = true;
    wicketType = 'bowled';
    dismissedPlayerId = data.homePlayers[strikerIndex];
  }

  const payload = JSON.stringify({
    innings_num: 1,
    bowler_id: data.awayPlayers[bowlerIndex],
    striker_id: data.homePlayers[strikerIndex],
    non_striker_id: data.homePlayers[strikerIndex === 0 ? 1 : 0],
    runs_batsman: runsBatsman,
    runs_extras: 0,
    is_wicket: isWicket,
    wicket_type: wicketType,
    dismissed_player_id: dismissedPlayerId,
    client_id: `stress-scorer-vu${vuId}-${iter}-${Date.now()}`,
  });

  const res = http.post(`${API}/matches/${data.matchId}/deliveries`, payload, {
    headers,
    tags: { type: 'delivery' },
  });

  totalRequests.add(1);
  deliveryLatency.add(res.timings.duration);

  const passed = check(res, {
    'scorer: delivery accepted': (r) => r.status === 201 || r.status === 200,
  });

  errorRate.add(passed ? 0 : 1);

  if (!passed) {
    console.warn(`Scorer VU${vuId}: ${res.status} — ${res.body?.substring(0, 200)}`);
  }

  sleep(1);
}

// ─── Scenario: Spectators (read) ────────────────────────────────────────────

export function spectatorScenario(data) {
  const matchId = data.matchId;
  const rand = Math.random();

  let res;
  let label;

  if (rand < 0.70) {
    label = 'scorecard';
    res = http.get(`${API}/matches/${matchId}/scorecard`, {
      tags: { type: 'scorecard' },
    });
  } else if (rand < 0.90) {
    label = 'match_detail';
    res = http.get(`${API}/matches/${matchId}`, {
      tags: { type: 'match_detail' },
    });
  } else {
    label = 'commentary';
    res = http.get(`${API}/matches/${matchId}/commentary`, {
      tags: { type: 'commentary' },
    });
  }

  totalRequests.add(1);
  readLatency.add(res.timings.duration);

  const passed = check(res, {
    [`spectator ${label}: status 200`]: (r) => r.status === 200,
    [`spectator ${label}: latency < 2s`]: (r) => r.timings.duration < 2000,
  });

  errorRate.add(passed ? 0 : 1);

  // Spectator poll interval
  sleep(Math.random() * 2 + 0.5);
}

// ─── Scenario: WebSocket viewers ────────────────────────────────────────────

export function websocketScenario(data) {
  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  const connectStart = Date.now();
  let connected = false;

  const res = ws.connect(wsUrl, {}, function (socket) {
    const connectTime = Date.now() - connectStart;
    wsLatency.add(connectTime);
    connected = true;

    socket.on('message', function (msg) {
      if (typeof msg === 'string') {
        // Engine.IO open -> send Socket.IO connect
        if (msg.startsWith('0')) {
          socket.send('40');
        }

        // Socket.IO connected -> join match room
        if (msg === '40' || msg.startsWith('40{')) {
          const joinPayload = JSON.stringify(['join_match', { match_id: data.matchId }]);
          socket.send(`42${joinPayload}`);
        }

        // Pong
        if (msg === '2') {
          socket.send('3');
        }
      }
    });

    socket.on('error', function (e) {
      errorRate.add(1);
    });

    // Hold connection for 60 seconds
    socket.setTimeout(function () {
      socket.close();
    }, 60000);
  });

  if (!connected) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

// ─── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`\n=== STRESS TEST COMPLETE ===`);
  console.log(`Match ID: ${data.matchId}`);
  console.log(`Review k6 output above to find the breaking point:`);
  console.log(`  - Look for when error rate exceeds 1%`);
  console.log(`  - Look for when p95 latency exceeds 2s`);
  console.log(`===========================\n`);
}
