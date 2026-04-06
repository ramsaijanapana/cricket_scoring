/**
 * Enhanced Application Performance Monitoring (APM) middleware.
 *
 * Provides:
 * - Request tracing with unique trace IDs
 * - Slow query detection (>100ms)
 * - Hot path profiling for delivery submission latency
 * - Memory usage tracking with periodic heap size reporting
 * - Prometheus-format metrics export
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Trace ID Management
// ---------------------------------------------------------------------------

const TRACE_HEADER = 'x-trace-id';

/**
 * Get the trace ID for the current request, or generate one.
 */
export function getTraceId(request: FastifyRequest): string {
  return (request as any)._traceId ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Metrics Storage
// ---------------------------------------------------------------------------

/** Histogram buckets for latency tracking (in seconds) */
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface HistogramMetric {
  buckets: Array<{ le: number; count: number }>;
  sum: number;
  count: number;
}

function createHistogram(): HistogramMetric {
  return {
    buckets: LATENCY_BUCKETS.map((le) => ({ le, count: 0 })),
    sum: 0,
    count: 0,
  };
}

function observeHistogram(h: HistogramMetric, value: number): void {
  h.sum += value;
  h.count += 1;
  for (const bucket of h.buckets) {
    if (value <= bucket.le) {
      bucket.count += 1;
    }
  }
}

// Delivery submission latency
const deliverySubmissionDuration = createHistogram();

// DB query duration
const dbQueryDuration = createHistogram();

// Slow query log (ring buffer, last 100 entries)
interface SlowQueryEntry {
  query: string;
  durationMs: number;
  traceId: string;
  timestamp: string;
}
const slowQueryLog: SlowQueryEntry[] = [];
const SLOW_QUERY_THRESHOLD_MS = 100;
const SLOW_QUERY_LOG_SIZE = 100;

// Memory snapshots (ring buffer, last 60 entries = ~1 hour at 1/min)
interface MemorySnapshot {
  timestamp: string;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  rss: number;
}
const memorySnapshots: MemorySnapshot[] = [];
const MEMORY_SNAPSHOT_SIZE = 60;

// ---------------------------------------------------------------------------
// Public API for instrumenting code
// ---------------------------------------------------------------------------

/**
 * Record a delivery submission duration.
 * Call this in the delivery submission endpoint after processing.
 */
export function recordDeliverySubmission(durationSec: number): void {
  observeHistogram(deliverySubmissionDuration, durationSec);
}

/**
 * Record a database query duration and log if it exceeds the slow query threshold.
 */
export function recordDbQuery(
  durationMs: number,
  query: string = 'unknown',
  traceId: string = 'unknown',
): void {
  observeHistogram(dbQueryDuration, durationMs / 1000);

  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    slowQueryLog.push({
      query: query.slice(0, 500), // Truncate for safety
      durationMs: Math.round(durationMs * 100) / 100,
      traceId,
      timestamp: new Date().toISOString(),
    });
    // Trim ring buffer
    if (slowQueryLog.length > SLOW_QUERY_LOG_SIZE) {
      slowQueryLog.splice(0, slowQueryLog.length - SLOW_QUERY_LOG_SIZE);
    }
    console.warn(
      `[APM] Slow query detected (${durationMs.toFixed(1)}ms) trace=${traceId}: ${query.slice(0, 200)}`,
    );
  }
}

/**
 * Wrap an async DB call to automatically track its duration.
 */
export async function trackQuery<T>(
  fn: () => Promise<T>,
  queryName: string = 'unknown',
  traceId: string = 'unknown',
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const durationMs = performance.now() - start;
    recordDbQuery(durationMs, queryName, traceId);
  }
}

/**
 * Get the slow query log (for diagnostics endpoint).
 */
export function getSlowQueryLog(): SlowQueryEntry[] {
  return [...slowQueryLog];
}

/**
 * Get the latest memory snapshot.
 */
export function getLatestMemorySnapshot(): MemorySnapshot | null {
  return memorySnapshots.length > 0 ? memorySnapshots[memorySnapshots.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Prometheus Metrics Serialization
// ---------------------------------------------------------------------------

function serializeHistogram(name: string, help: string, h: HistogramMetric): string {
  const lines: string[] = [];
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} histogram`);
  for (const bucket of h.buckets) {
    lines.push(`${name}_bucket{le="${bucket.le}"} ${bucket.count}`);
  }
  lines.push(`${name}_bucket{le="+Inf"} ${h.count}`);
  lines.push(`${name}_sum ${h.sum.toFixed(6)}`);
  lines.push(`${name}_count ${h.count}`);
  return lines.join('\n');
}

/**
 * Generate Prometheus-format metrics string for APM-specific metrics.
 * This is designed to be appended to the existing /metrics output.
 */
export function serializeApmMetrics(): string {
  const sections: string[] = [];

  // Delivery submission latency
  sections.push(
    serializeHistogram(
      'delivery_submission_duration_seconds',
      'Duration of delivery submission processing in seconds',
      deliverySubmissionDuration,
    ),
  );

  // DB query duration
  sections.push(
    serializeHistogram(
      'db_query_duration_seconds',
      'Database query duration in seconds',
      dbQueryDuration,
    ),
  );

  // Node.js heap memory
  const mem = process.memoryUsage();
  sections.push('# HELP nodejs_heap_used_bytes Current Node.js heap used in bytes');
  sections.push('# TYPE nodejs_heap_used_bytes gauge');
  sections.push(`nodejs_heap_used_bytes ${mem.heapUsed}`);

  sections.push('# HELP nodejs_heap_total_bytes Total Node.js heap size in bytes');
  sections.push('# TYPE nodejs_heap_total_bytes gauge');
  sections.push(`nodejs_heap_total_bytes ${mem.heapTotal}`);

  sections.push('# HELP nodejs_external_bytes Node.js external memory in bytes');
  sections.push('# TYPE nodejs_external_bytes gauge');
  sections.push(`nodejs_external_bytes ${mem.external}`);

  sections.push('# HELP nodejs_rss_bytes Node.js RSS in bytes');
  sections.push('# TYPE nodejs_rss_bytes gauge');
  sections.push(`nodejs_rss_bytes ${mem.rss}`);

  // Slow query count
  sections.push('# HELP slow_queries_total Total number of slow queries detected');
  sections.push('# TYPE slow_queries_total counter');
  sections.push(`slow_queries_total ${slowQueryLog.length}`);

  return sections.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Memory tracking interval
// ---------------------------------------------------------------------------

let memoryInterval: ReturnType<typeof setInterval> | null = null;

function recordMemorySnapshot(): void {
  const mem = process.memoryUsage();
  memorySnapshots.push({
    timestamp: new Date().toISOString(),
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    externalBytes: mem.external,
    rss: mem.rss,
  });
  if (memorySnapshots.length > MEMORY_SNAPSHOT_SIZE) {
    memorySnapshots.splice(0, memorySnapshots.length - MEMORY_SNAPSHOT_SIZE);
  }
}

// ---------------------------------------------------------------------------
// Fastify Plugin Registration
// ---------------------------------------------------------------------------

/**
 * Register enhanced APM middleware on the Fastify instance.
 *
 * - Adds trace ID to every request/response
 * - Tracks delivery submission latency for hot path profiling
 * - Starts periodic memory usage reporting
 * - Extends /metrics endpoint with APM metrics
 */
export async function registerApm(app: FastifyInstance): Promise<void> {
  // --- Trace ID injection ---
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = (request.headers[TRACE_HEADER] as string) || randomUUID();
    (request as any)._traceId = traceId;
    reply.header(TRACE_HEADER, traceId);
    // Also add to log context
    request.log = request.log.child({ traceId });
  });

  // --- Hot path profiling: delivery submission ---
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Detect delivery submission endpoints
    const url = request.routeOptions?.url || request.url;
    const isDeliverySubmission =
      request.method === 'POST' &&
      (url.includes('/deliveries') || url.includes('/submit'));

    if (isDeliverySubmission) {
      const start = (request as any)._metricsStart;
      if (start !== undefined) {
        const durationSec = (performance.now() - start) / 1000;
        recordDeliverySubmission(durationSec);
      }
    }
  });

  // --- Periodic memory usage reporting (every 60 seconds) ---
  recordMemorySnapshot(); // Initial snapshot
  memoryInterval = setInterval(recordMemorySnapshot, 60_000);

  // Clean up on server close
  app.addHook('onClose', async () => {
    if (memoryInterval) {
      clearInterval(memoryInterval);
      memoryInterval = null;
    }
  });

  // --- APM diagnostics endpoint ---
  app.get('/apm/diagnostics', async () => {
    return {
      slowQueries: getSlowQueryLog(),
      memorySnapshots: memorySnapshots.slice(-10),
      deliverySubmissions: {
        count: deliverySubmissionDuration.count,
        avgMs:
          deliverySubmissionDuration.count > 0
            ? Math.round((deliverySubmissionDuration.sum / deliverySubmissionDuration.count) * 1000 * 100) / 100
            : 0,
      },
      dbQueries: {
        count: dbQueryDuration.count,
        avgMs:
          dbQueryDuration.count > 0
            ? Math.round((dbQueryDuration.sum / dbQueryDuration.count) * 1000 * 100) / 100
            : 0,
      },
    };
  });
}
