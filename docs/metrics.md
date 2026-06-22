# API Metrics & Observability

The API exposes Prometheus-format metrics and APM diagnostics for monitoring latency, errors, and database performance.

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /metrics` | Admin JWT or internal bearer token | Prometheus scrape target |
| `GET /apm/diagnostics` | Admin JWT or internal bearer token | JSON snapshot of slow queries and memory |
| `GET /health` | Public | Liveness/readiness (not for Prometheus) |

Metrics and APM routes use the same auth as other admin-only endpoints (`requireAdminOrInternal` in `apps/api/src/server.ts`).

## Scraping `/metrics`

Example Prometheus job:

```yaml
scrape_configs:
  - job_name: cricket-api
    metrics_path: /metrics
    authorization:
      credentials: <admin-jwt-or-internal-token>
    static_configs:
      - targets: ['api:3001']
```

Response `Content-Type`: `text/plain; version=0.0.4; charset=utf-8`

## Exported metrics

### HTTP (from `middleware/metrics.ts`)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | counter | `method`, `route` | Total requests per route template |
| `http_request_errors_total` | counter | `method`, `route` | Responses with status ≥ 400 |
| `http_request_duration_seconds` | histogram | `method`, `route` | End-to-end request latency |

Route labels use Fastify route templates (e.g. `/api/v1/matches/:id`) to limit cardinality.

### Database & hot path (from `middleware/apm.ts`)

| Metric | Type | Description |
|--------|------|-------------|
| `db_query_duration_seconds` | histogram | Drizzle/postgres query latency (instrumented in `db/index.ts`) |
| `delivery_submission_duration_seconds` | histogram | POST delivery submission latency |
| `slow_queries_total` | counter | Slow queries logged (>100 ms) |
| `nodejs_heap_used_bytes` | gauge | Current heap usage |
| `nodejs_heap_total_bytes` | gauge | Total heap size |
| `nodejs_external_bytes` | gauge | External memory |
| `nodejs_rss_bytes` | gauge | Resident set size |

Slow queries (>100 ms) are also logged to stderr with trace ID (`x-trace-id` header).

## Trace correlation

Every request receives an `x-trace-id` response header (from APM middleware). Pass the same header on downstream calls to correlate logs and slow-query entries.

## Sentry releases

When `SENTRY_DSN` is set, Sentry uses release `api@${APP_VERSION}`. Set `APP_VERSION` in deployment (e.g. git SHA via `docker-compose.prod.yml`) so errors group by deploy.

## Related files

- `apps/api/src/middleware/metrics.ts` — HTTP metrics and `/metrics` route
- `apps/api/src/middleware/apm.ts` — DB timing, delivery profiling, memory snapshots
- `apps/api/src/db/index.ts` — postgres.js instrumentation for Drizzle queries
- `apps/api/src/services/sentry.ts` — error tracking and release tagging
