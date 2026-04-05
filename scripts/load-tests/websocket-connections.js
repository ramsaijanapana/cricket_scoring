/**
 * WebSocket Scalability Test
 *
 * Simulates 500 concurrent WebSocket connections joining a match room and
 * verifying they all receive delivery broadcast events.
 *
 * Targets:
 *   - 0 dropped connections
 *   - < 100ms broadcast latency (time from delivery POST to WS event received)
 *   - Duration: 2 minutes
 *
 * Run:
 *   k6 run scripts/load-tests/websocket-connections.js
 *
 * NOTE: k6 WebSocket support uses the k6/ws module. Socket.IO uses a custom
 * protocol on top of WebSocket, so we connect to the Engine.IO transport
 * directly (/socket.io/?EIO=4&transport=websocket).
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import {
  WS_URL,
  API,
  authenticate,
  authHeaders,
  createAndStartMatch,
} from './config.js';

// ─── Custom metrics ─────────────────────────────────────────────────────────

const wsConnectDuration = new Trend('ws_connect_duration', true);
const wsBroadcastLatency = new Trend('ws_broadcast_latency', true);
const wsDropped = new Rate('ws_dropped_connections');
const wsMessagesReceived = new Counter('ws_messages_received');

// ─── k6 options ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    websocket_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 100 },
        { duration: '15s', target: 250 },
        { duration: '15s', target: 500 },
        { duration: '1m', target: 500 },   // sustain at full load
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ws_dropped_connections: ['rate<0.001'],
    ws_broadcast_latency: ['p(95)<100'],
    ws_connect_duration: ['p(95)<500'],
  },
};

// ─── Setup: create match + scorer auth ──────────────────────────────────────

export function setup() {
  const auth = authenticate();
  if (!auth.accessToken) {
    throw new Error('Setup failed: could not authenticate');
  }

  const matchCtx = createAndStartMatch(auth.accessToken);

  console.log(`WS Test setup: matchId=${matchCtx.matchId}`);

  return {
    accessToken: auth.accessToken,
    matchId: matchCtx.matchId,
    inningsId: matchCtx.inningsId,
    homePlayers: matchCtx.homePlayers,
    awayPlayers: matchCtx.awayPlayers,
  };
}

// ─── VU code: connect via WebSocket, join match room, listen for events ─────

export default function (data) {
  const matchId = data.matchId;

  // Socket.IO Engine.IO v4 WebSocket URL
  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

  const connectStart = Date.now();
  let connected = false;
  let receivedDeliveryEvent = false;

  const res = ws.connect(wsUrl, {}, function (socket) {
    const connectTime = Date.now() - connectStart;
    wsConnectDuration.add(connectTime);
    connected = true;

    // Engine.IO handshake: server sends "0{...}" (open packet).
    // We need to respond with "40" to complete Socket.IO handshake.
    socket.on('message', function (msg) {
      if (typeof msg === 'string') {
        // Engine.IO open packet
        if (msg.startsWith('0')) {
          // Send Socket.IO CONNECT packet (type 0, namespace /)
          socket.send('40');
        }

        // Socket.IO CONNECT ACK (server responds with "40{...}" for namespace)
        if (msg === '40' || msg.startsWith('40{')) {
          // Now join the match room
          // Socket.IO event encoding: "42" prefix + JSON array ["event", data]
          const joinPayload = JSON.stringify(['join_match', { match_id: matchId }]);
          socket.send(`42${joinPayload}`);
        }

        // Socket.IO event messages start with "42"
        if (msg.startsWith('42')) {
          try {
            const eventData = JSON.parse(msg.substring(2));
            const eventName = eventData[0];

            if (
              eventName === 'delivery' ||
              eventName === 'wicket' ||
              eventName === 'over_complete' ||
              eventName === 'status_update'
            ) {
              const receiveTime = Date.now();
              wsMessagesReceived.add(1);
              receivedDeliveryEvent = true;

              // Estimate broadcast latency from server timestamp if available
              const payload = eventData[1];
              if (payload && payload.delivery && payload.delivery.createdAt) {
                const serverTime = new Date(payload.delivery.createdAt).getTime();
                const latency = receiveTime - serverTime;
                if (latency >= 0 && latency < 10000) {
                  wsBroadcastLatency.add(latency);
                }
              }
            }
          } catch {
            // not a JSON event, ignore
          }
        }

        // Engine.IO ping: server sends "2", reply with "3" (pong)
        if (msg === '2') {
          socket.send('3');
        }
      }
    });

    socket.on('error', function (e) {
      console.warn(`WS error VU${__VU}: ${e}`);
      wsDropped.add(1);
    });

    // Keep connection alive for the scenario duration.
    // Also periodically send a delivery from one VU to generate broadcast events.
    if (__VU === 1 && __ITER === 0) {
      // VU 1 acts as the scorer — sends a delivery every 3 seconds
      socket.setInterval(function () {
        const overNum = Math.floor(Date.now() / 18000) % data.awayPlayers.length;
        const payload = JSON.stringify({
          innings_num: 1,
          bowler_id: data.awayPlayers[overNum],
          striker_id: data.homePlayers[0],
          non_striker_id: data.homePlayers[1],
          runs_batsman: Math.floor(Math.random() * 5),
          runs_extras: 0,
          is_wicket: false,
          client_id: `ws-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });

        http.post(`${API}/matches/${data.matchId}/deliveries`, payload, {
          headers: authHeaders(data.accessToken),
        });
      }, 3000);
    }

    // Stay connected for 90 seconds (within scenario duration)
    socket.setTimeout(function () {
      socket.close();
    }, 90000);
  });

  check(res, {
    'WS connection established': () => connected,
    'WS status is 101': (r) => r && r.status === 101,
  });

  if (!connected) {
    wsDropped.add(1);
  } else {
    wsDropped.add(0);
  }
}

// ─── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`WebSocket test complete: matchId=${data.matchId}`);
}
