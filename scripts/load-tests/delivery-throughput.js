/**
 * Delivery Throughput Test
 *
 * Simulates 10 concurrent scorers submitting deliveries at ~1 delivery/second.
 * Each VU operates on a shared match created during setup.
 *
 * Targets:
 *   - p95 latency < 500ms
 *   - 0% error rate
 *   - Duration: 2 minutes
 *
 * Run:
 *   k6 run scripts/load-tests/delivery-throughput.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import {
  API,
  authenticate,
  authHeaders,
  createAndStartMatch,
  DELIVERY_THRESHOLDS,
} from './config.js';

// ─── Custom metrics ─────────────────────────────────────────────────────────

const deliveryDuration = new Trend('delivery_duration', true);
const deliveryErrors = new Rate('delivery_errors');

// ─── k6 options ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    scoring: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
    },
  },
  thresholds: {
    ...DELIVERY_THRESHOLDS,
    delivery_duration: ['p(95)<500', 'p(99)<1000'],
    delivery_errors: ['rate<0.001'],
  },
};

// ─── Setup: create auth token + match with players ──────────────────────────

export function setup() {
  const auth = authenticate();
  if (!auth.accessToken) {
    throw new Error('Setup failed: could not authenticate');
  }

  const matchCtx = createAndStartMatch(auth.accessToken);

  console.log(`Setup complete: matchId=${matchCtx.matchId}, inningsId=${matchCtx.inningsId}`);

  return {
    accessToken: auth.accessToken,
    matchId: matchCtx.matchId,
    inningsId: matchCtx.inningsId,
    homePlayers: matchCtx.homePlayers,
    awayPlayers: matchCtx.awayPlayers,
  };
}

// ─── VU code: submit one delivery per second ────────────────────────────────

export default function (data) {
  const headers = authHeaders(data.accessToken);
  const vuId = __VU;
  const iter = __ITER;

  // Rotate bowler per over (~6 iterations), cycle batsmen
  const overNum = Math.floor(iter / 6);
  const bowlerIndex = (overNum + vuId) % data.awayPlayers.length;
  const strikerIndex = iter % 2 === 0 ? 0 : 1;
  const nonStrikerIndex = strikerIndex === 0 ? 1 : 0;

  // Realistic run distribution
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
    non_striker_id: data.homePlayers[nonStrikerIndex],
    runs_batsman: runsBatsman,
    runs_extras: 0,
    is_wicket: isWicket,
    wicket_type: wicketType,
    dismissed_player_id: dismissedPlayerId,
    client_id: `k6-vu${vuId}-iter${iter}-${Date.now()}`,
  });

  const res = http.post(`${API}/matches/${data.matchId}/deliveries`, payload, {
    headers,
    tags: { type: 'delivery' },
  });

  deliveryDuration.add(res.timings.duration);

  const passed = check(res, {
    'delivery accepted (201 or 200)': (r) => r.status === 201 || r.status === 200,
    'response has delivery': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.delivery;
      } catch {
        return false;
      }
    },
    'latency < 500ms': (r) => r.timings.duration < 500,
  });

  if (!passed) {
    deliveryErrors.add(1);
    if (res.status !== 201 && res.status !== 200) {
      console.warn(`VU${vuId} delivery failed: ${res.status} ${res.body}`);
    }
  } else {
    deliveryErrors.add(0);
  }

  // ~1 delivery per second
  sleep(1);
}

// ─── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`Teardown: matchId=${data.matchId}`);
  // Match data is left in DB for post-test inspection.
  // In CI you may want to delete it via the API.
}
