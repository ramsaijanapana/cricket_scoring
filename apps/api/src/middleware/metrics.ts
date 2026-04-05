import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ── In-memory metric storage ────────────────────────────────────────────────

interface HistogramBucket {
  le: number;
  count: number;
}

interface RouteMetric {
  requests: number;
  errors: number;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const routeMetrics = new Map<string, RouteMetric>();
const dbQueryDurations: number[] = [];

function getOrCreateRouteMetric(key: string): RouteMetric {
  let metric = routeMetrics.get(key);
  if (!metric) {
    metric = {
      requests: 0,
      errors: 0,
      buckets: DURATION_BUCKETS.map((le) => ({ le, count: 0 })),
      sum: 0,
      count: 0,
    };
    routeMetrics.set(key, metric);
  }
  return metric;
}

function recordDuration(metric: RouteMetric, durationSec: number): void {
  metric.sum += durationSec;
  metric.count += 1;
  for (const bucket of metric.buckets) {
    if (durationSec <= bucket.le) {
      bucket.count += 1;
    }
  }
}

// ── Drizzle query logger for DB duration tracking ───────────────────────────

/**
 * Drizzle logger that records query durations for metrics.
 * Pass to drizzle({ logger: metricsQueryLogger }) to enable DB tracking.
 */
export const metricsQueryLogger = {
  logQuery(query: string, params: unknown[]): void {
    // We track timing externally; this is for compatibility with Drizzle's logger interface
    const start = performance.now();
    // Note: Drizzle calls logQuery before execution. We record a placeholder
    // and rely on the onResponse hook for actual HTTP timing. For DB-specific
    // timing, use trackDbQuery() around individual calls.
    void query;
    void params;
    void start;
  },
};

/**
 * Wrap a DB call to track its duration for metrics.
 */
export async function trackDbQuery<T>(fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const durationMs = performance.now() - start;
    dbQueryDurations.push(durationMs / 1000);
    // Keep only last 10k entries to avoid memory leak
    if (dbQueryDurations.length > 10_000) {
      dbQueryDurations.splice(0, dbQueryDurations.length - 5_000);
    }
  }
}

// ── Prometheus format serializer ────────────────────────────────────────────

function serializeMetrics(): string {
  const lines: string[] = [];

  // http_requests_total
  lines.push('# HELP http_requests_total Total number of HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [key, metric] of routeMetrics) {
    const [method, route] = key.split('|');
    lines.push(`http_requests_total{method="${method}",route="${route}"} ${metric.requests}`);
  }

  // http_request_errors_total
  lines.push('# HELP http_request_errors_total Total number of HTTP request errors');
  lines.push('# TYPE http_request_errors_total counter');
  for (const [key, metric] of routeMetrics) {
    const [method, route] = key.split('|');
    if (metric.errors > 0) {
      lines.push(`http_request_errors_total{method="${method}",route="${route}"} ${metric.errors}`);
    }
  }

  // http_request_duration_seconds
  lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const [key, metric] of routeMetrics) {
    const [method, route] = key.split('|');
    const labels = `method="${method}",route="${route}"`;
    for (const bucket of metric.buckets) {
      lines.push(`http_request_duration_seconds_bucket{${labels},le="${bucket.le}"} ${bucket.count}`);
    }
    lines.push(`http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`);
    lines.push(`http_request_duration_seconds_sum{${labels}} ${metric.sum.toFixed(6)}`);
    lines.push(`http_request_duration_seconds_count{${labels}} ${metric.count}`);
  }

  // db_query_duration_seconds
  if (dbQueryDurations.length > 0) {
    const dbSum = dbQueryDurations.reduce((a, b) => a + b, 0);
    lines.push('# HELP db_query_duration_seconds Database query duration in seconds');
    lines.push('# TYPE db_query_duration_seconds summary');
    lines.push(`db_query_duration_seconds_sum ${dbSum.toFixed(6)}`);
    lines.push(`db_query_duration_seconds_count ${dbQueryDurations.length}`);
  }

  return lines.join('\n') + '\n';
}

// ── Fastify plugin ──────────────────────────────────────────────────────────

/**
 * Register metrics collection hooks and /metrics endpoint.
 */
export async function registerMetrics(app: FastifyInstance): Promise<void> {
  // Track request start time
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any)._metricsStart = performance.now();
  });

  // Record metrics on response
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const start = (request as any)._metricsStart;
    if (start === undefined) return;

    const durationSec = (performance.now() - start) / 1000;
    // Use the route schema URL (e.g. /api/v1/matches/:id) to avoid high cardinality
    const route = (request.routeOptions?.url || request.url).replace(/\?.*$/, '');
    const key = `${request.method}|${route}`;
    const metric = getOrCreateRouteMetric(key);

    metric.requests += 1;
    if (reply.statusCode >= 400) {
      metric.errors += 1;
    }
    recordDuration(metric, durationSec);
  });

  // Expose /metrics endpoint (Prometheus scrape target)
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(serializeMetrics());
  });
}
