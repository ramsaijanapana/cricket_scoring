import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';

const REFRESH_URL = '/api/v1/auth/refresh';

const userData = {
  userId: 'user-123',
  email: 'test@example.com',
  role: 'spectator',
};

const redisMocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    store,
    sets,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    srem: vi.fn(async (key: string, member: string) => {
      sets.get(key)?.delete(member);
      return 1;
    }),
    sadd: vi.fn(async (key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
      return 1;
    }),
    reset() {
      store.clear();
      sets.clear();
      this.get.mockClear();
      this.set.mockClear();
      this.del.mockClear();
      this.srem.mockClear();
      this.sadd.mockClear();
    },
  };
});

vi.mock('ioredis', () => ({
  default: class MockRedis {
    get = redisMocks.get;
    set = redisMocks.set;
    del = redisMocks.del;
    srem = redisMocks.srem;
    sadd = redisMocks.sadd;
  },
}));

vi.mock('../db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../services/email-service', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import { authRoutes } from './auth';

describe('POST /api/v1/auth/refresh', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(fastifyJwt, { secret: 'test-secret' });
    await app.register(authRoutes, { prefix: '/api/v1/auth' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    redisMocks.reset();
  });

  it('returns 400 when refresh_token is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: REFRESH_URL,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'refresh_token is required' });
  });

  it('returns 401 for invalid or expired refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: REFRESH_URL,
      payload: { refresh_token: 'unknown-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid or expired refresh token' });
  });

  it('returns new access and refresh tokens for valid refresh token', async () => {
    const oldToken = 'valid-refresh-token';
    redisMocks.store.set(`refresh:${oldToken}`, JSON.stringify(userData));
    redisMocks.sets.set(`sessions:${userData.userId}`, new Set([oldToken]));

    const res = await app.inject({
      method: 'POST',
      url: REFRESH_URL,
      payload: { refresh_token: oldToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.access_token).toBeTypeOf('string');
    expect(body.refresh_token).toBeTypeOf('string');
    expect(body.refresh_token).not.toBe(oldToken);
    expect(body.expires_in).toBe(3600);
  });

  it('invalidates the old refresh token after successful refresh', async () => {
    const oldToken = 'rotate-me-token';
    redisMocks.store.set(`refresh:${oldToken}`, JSON.stringify(userData));
    redisMocks.sets.set(`sessions:${userData.userId}`, new Set([oldToken]));

    await app.inject({
      method: 'POST',
      url: REFRESH_URL,
      payload: { refresh_token: oldToken },
    });

    expect(redisMocks.del).toHaveBeenCalledWith(`refresh:${oldToken}`);
    expect(redisMocks.srem).toHaveBeenCalledWith(`sessions:${userData.userId}`, oldToken);
    expect(redisMocks.store.has(`refresh:${oldToken}`)).toBe(false);

    const retry = await app.inject({
      method: 'POST',
      url: REFRESH_URL,
      payload: { refresh_token: oldToken },
    });

    expect(retry.statusCode).toBe(401);
  });
});
