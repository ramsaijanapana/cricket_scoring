# Load Testing Suite (k6)

Performance and load tests for the CricScore API using [k6](https://k6.io/).

## Prerequisites

1. **Install k6** — https://grafana.com/docs/k6/latest/set-up/install-k6/

   ```bash
   # macOS
   brew install k6

   # Windows (winget)
   winget install k6 --source winget

   # Windows (choco)
   choco install k6

   # Docker
   docker pull grafana/k6
   ```

2. **Start services**

   ```bash
   docker compose up -d        # PostgreSQL + Redis
   npm run db:migrate           # run migrations
   npm run db:seed              # optional: seed data
   npm run dev:api              # start the API server
   ```

## Test Files

| File | Purpose | VUs | Duration |
|------|---------|-----|----------|
| `delivery-throughput.js` | Write throughput — 10 scorers posting deliveries | 10 | 2 min |
| `spectator-load.js` | Read-heavy — 1000 spectators reading scorecards | 1000 | 5 min |
| `websocket-connections.js` | WebSocket — 500 concurrent connections | 500 | ~2 min |
| `stress-test.js` | Combined — ramp 10 to 500 VUs (mixed workload) | 500 | 5 min |
| `config.js` | Shared helpers: auth, match creation, thresholds | — | — |

## Running Tests

```bash
# Individual tests
k6 run scripts/load-tests/delivery-throughput.js
k6 run scripts/load-tests/spectator-load.js
k6 run scripts/load-tests/websocket-connections.js
k6 run scripts/load-tests/stress-test.js

# With npm scripts
npm run test:load              # runs stress-test.js
npm run test:load:delivery     # runs delivery-throughput.js
npm run test:load:spectator    # runs spectator-load.js
npm run test:load:ws           # runs websocket-connections.js

# Override environment
k6 run -e BASE_URL=http://staging.cricscore.app:3001 scripts/load-tests/stress-test.js

# Custom test account credentials
k6 run -e TEST_USER_EMAIL=scorer@test.com -e TEST_USER_PASSWORD=secret scripts/load-tests/delivery-throughput.js
```

## Targets / Thresholds

| Metric | Target |
|--------|--------|
| Delivery POST p95 | < 500ms |
| Scorecard GET p95 (cached) | < 200ms |
| Match detail GET p95 | < 200ms |
| WebSocket broadcast latency p95 | < 100ms |
| Error rate (all tests) | < 1% |
| Stress test breaking point | error rate > 1% or p95 > 2s |

## Configuration

Tests auto-create a test scorer account, two teams, players, and a match during the `setup()` phase. No manual data seeding is required.

Environment variables (pass via `k6 run -e KEY=VALUE`):

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3001` | API base URL |
| `WS_URL` | `ws://localhost:3001` | WebSocket base URL |
| `TEST_USER_EMAIL` | `loadtest@cricscore.dev` | Test scorer email |
| `TEST_USER_PASSWORD` | `LoadTest123!` | Test scorer password |

## Tips

- **Rate limiting**: The API has a global 100 req/min rate limit. For load tests against a local dev server, consider temporarily increasing this in `apps/api/src/server.ts` or disabling it entirely.
- **k6 Cloud**: For tests exceeding local machine capacity, use `k6 cloud` to run distributed tests.
- **Grafana dashboards**: Stream results to Grafana with `k6 run --out influxdb=http://localhost:8086/k6` for real-time visualization.
- **CI integration**: Add `k6 run --quiet --summary-trend-stats="p(95),p(99),avg" scripts/load-tests/stress-test.js` to your CI pipeline.
