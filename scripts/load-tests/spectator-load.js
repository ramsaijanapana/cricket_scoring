/**
 * Spectator Load Test
 *
 * Simulates 1000 concurrent spectators hitting read-heavy endpoints:
 *   - 70% GET /matches/:id/scorecard
 *   - 20% GET /matches/:id
 *   - 10% GET /matches/:id/commentary
 *
 * Targets:
 *   - p95 < 200ms for cached reads
 *   - p95 < 1s for uncached reads
 *   - Error rate < 1%
 *   - Duration: 5 minutes
 *
 * Run:
 *   k6 run scripts/load-tests/spectator-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import {
  API,
  authenticate,
  authHeaders,
  createAndStartMatch,
  SPECTATOR_THRESHOLDS,
} from './config.js';

// ─── Custom metrics ─────────────────────────────────────────────────────────

const scorecardLatency = new Trend('scorecard_latency', true);
const matchDetailLatency = new Trend('match_detail_latency', true);
const commentaryLatency = new Trend('commentary_latency', true);
const spectatorErrors = new Rate('spectator_errors');

// ─── k6 options ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    spectators: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 250 },   // warm-up ramp
        { duration: '30s', target: 500 },   // half load
        { duration: '30s', target: 1000 },  // full load
        { duration: '2m', target: 1000 },   // sustain
        { duration: '30s', target: 0 },     // ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ...SPECTATOR_THRESHOLDS,
    scorecard_latency: ['p(95)<200', 'p(99)<500'],
    match_detail_latency: ['p(95)<200', 'p(99)<500'],
    commentary_latency: ['p(95)<200', 'p(99)<500'],
    spectator_errors: ['rate<0.01'],
  },
};

// ─── Setup: create a match with some deliveries so scorecard has data ───────

export function setup() {
  const auth = authenticate();
  if (!auth.accessToken) {
    throw new Error('Setup failed: could not authenticate');
  }

  const matchCtx = createAndStartMatch(auth.accessToken);
  const headers = authHeaders(auth.accessToken);

  // Seed 30 deliveries (~5 overs) so the scorecard has meaningful data
  for (let i = 0; i < 30; i++) {
    const overNum = Math.floor(i / 6);
    const bowlerIndex = overNum % matchCtx.awayPlayers.length;

    const payload = JSON.stringify({
      innings_num: 1,
      bowler_id: matchCtx.awayPlayers[bowlerIndex],
      striker_id: matchCtx.homePlayers[i % 2 === 0 ? 0 : 1],
      non_striker_id: matchCtx.homePlayers[i % 2 === 0 ? 1 : 0],
      runs_batsman: [0, 1, 2, 4, 1, 0][i % 6],
      runs_extras: 0,
      is_wicket: false,
      client_id: `setup-delivery-${i}-${Date.now()}`,
    });

    const res = http.post(`${API}/matches/${matchCtx.matchId}/deliveries`, payload, {
      headers,
    });

    if (res.status !== 201 && res.status !== 200) {
      console.warn(`Setup delivery ${i} failed: ${res.status}`);
    }
  }

  console.log(`Setup complete: matchId=${matchCtx.matchId} with 30 seeded deliveries`);

  return {
    matchId: matchCtx.matchId,
  };
}

// ─── VU code: weighted random read requests ─────────────────────────────────

export default function (data) {
  const matchId = data.matchId;
  const rand = Math.random();

  let res;
  let endpoint;

  if (rand < 0.70) {
    // 70% — scorecard read
    endpoint = 'scorecard';
    res = http.get(`${API}/matches/${matchId}/scorecard`, {
      tags: { type: 'scorecard' },
    });
    scorecardLatency.add(res.timings.duration);
  } else if (rand < 0.90) {
    // 20% — match detail
    endpoint = 'match_detail';
    res = http.get(`${API}/matches/${matchId}`, {
      tags: { type: 'match_detail' },
    });
    matchDetailLatency.add(res.timings.duration);
  } else {
    // 10% — commentary
    endpoint = 'commentary';
    res = http.get(`${API}/matches/${matchId}/commentary`, {
      tags: { type: 'commentary' },
    });
    commentaryLatency.add(res.timings.duration);
  }

  const passed = check(res, {
    [`${endpoint}: status 200`]: (r) => r.status === 200,
    [`${endpoint}: has body`]: (r) => r.body && r.body.length > 2,
    [`${endpoint}: latency < 1s`]: (r) => r.timings.duration < 1000,
  });

  if (!passed) {
    spectatorErrors.add(1);
    if (res.status >= 500) {
      console.warn(`${endpoint} error: ${res.status}`);
    }
  } else {
    spectatorErrors.add(0);
  }

  // Spectator poll interval: 1-3 seconds (realistic refresh cadence)
  sleep(Math.random() * 2 + 1);
}

// ─── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`Teardown: spectator test for matchId=${data.matchId}`);
}
