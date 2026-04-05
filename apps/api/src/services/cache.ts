import Redis from 'ioredis';
import { env } from '../config';

let redisClient: Redis | null = null;
let connectionFailed = false;

/**
 * Singleton Redis client for caching.
 * Returns null if Redis is unavailable — callers must handle gracefully.
 */
export function getRedisClient(): Redis | null {
  if (connectionFailed) return null;
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) {
          connectionFailed = true;
          console.warn('Redis cache: giving up after 3 retries, caching disabled');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.warn('Redis cache error:', err.message);
    });

    redisClient.on('connect', () => {
      connectionFailed = false;
      console.log('Redis cache connected');
    });

    // Attempt connection (non-blocking)
    redisClient.connect().catch(() => {
      connectionFailed = true;
      console.warn('Redis cache: initial connection failed, caching disabled');
    });

    return redisClient;
  } catch {
    connectionFailed = true;
    return null;
  }
}

/**
 * Get a cached value by key. Returns null on miss or Redis failure.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    if (!client) return null;

    const raw = await client.get(key);
    if (!raw) return null;

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set a cached value. Silently fails if Redis is unavailable.
 */
export async function cacheSet(key: string, data: unknown, ttlSeconds?: number): Promise<void> {
  try {
    const client = getRedisClient();
    if (!client) return;

    const serialized = JSON.stringify(data);
    if (ttlSeconds) {
      await client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await client.set(key, serialized);
    }
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Delete a single cached key.
 */
export async function cacheInvalidate(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (!client) return;

    await client.del(key);
  } catch {
    // Cache invalidation failure is non-critical
  }
}

/**
 * Invalidate all cache keys for a given match.
 */
export async function invalidateMatchCache(matchId: string): Promise<void> {
  await Promise.all([
    cacheInvalidate(`match:${matchId}:live_score`),
    cacheInvalidate(`match:${matchId}:scorecard`),
    cacheInvalidate(`match:${matchId}:detail`),
  ]);
}
