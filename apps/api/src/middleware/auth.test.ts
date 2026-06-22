import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth, requireRole, requireAdminOrInternal, getUserId } from './auth';
import { env } from '../config';

function mockRequest(overrides: {
  user?: { sub?: string; role?: string; roles?: string[] } | null;
  headers?: Record<string, string | undefined>;
} = {}): FastifyRequest {
  const req = { headers: overrides.headers ?? {} } as FastifyRequest & { user?: unknown };
  if (overrides.user !== undefined) {
    req.user = overrides.user;
  }
  return req;
}

function mockReply() {
  const sent: { statusCode?: number; payload?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      sent.payload = payload;
      return reply;
    },
    get sent() {
      return sent;
    },
  };
  return reply as unknown as FastifyReply & { sent: typeof sent };
}

describe('requireAuth', () => {
  const originalAllowDevAuth = env.ALLOW_DEV_AUTH;

  beforeEach(() => {
    env.ALLOW_DEV_AUTH = false;
  });

  afterEach(() => {
    env.ALLOW_DEV_AUTH = originalAllowDevAuth;
  });

  it('returns 401 when user is missing', async () => {
    const request = mockRequest();
    const reply = mockReply();

    await requireAuth(request, reply);

    expect(reply.sent.statusCode).toBe(401);
    expect(reply.sent.payload).toEqual({ error: 'Authentication required' });
  });

  it('returns 401 when user has no sub', async () => {
    const request = mockRequest({ user: { role: 'spectator' } });
    const reply = mockReply();

    await requireAuth(request, reply);

    expect(reply.sent.statusCode).toBe(401);
  });

  it('passes when user has sub', async () => {
    const request = mockRequest({ user: { sub: 'user-1', role: 'scorer' } });
    const reply = mockReply();

    await requireAuth(request, reply);

    expect(reply.sent.statusCode).toBeUndefined();
  });

  it('injects dev user when ALLOW_DEV_AUTH is enabled', async () => {
    env.ALLOW_DEV_AUTH = true;
    const request = mockRequest();
    const reply = mockReply();

    await requireAuth(request, reply);

    expect((request as any).user).toEqual({
      sub: 'dev-user',
      role: 'admin',
      roles: ['admin', 'scorer'],
    });
    expect(reply.sent.statusCode).toBeUndefined();
  });
});

describe('requireRole', () => {
  const originalAllowDevAuth = env.ALLOW_DEV_AUTH;

  beforeEach(() => {
    env.ALLOW_DEV_AUTH = false;
  });

  afterEach(() => {
    env.ALLOW_DEV_AUTH = originalAllowDevAuth;
  });

  it('returns 401 when user is missing', async () => {
    const handler = requireRole('admin');
    const request = mockRequest();
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.sent.statusCode).toBe(401);
    expect(reply.sent.payload).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns 403 when user lacks required role', async () => {
    const handler = requireRole('admin', 'scorer');
    const request = mockRequest({ user: { sub: 'user-1', role: 'spectator' } });
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.sent.statusCode).toBe(403);
    expect(reply.sent.payload).toEqual({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  });

  it('passes when user has one of the required roles', async () => {
    const handler = requireRole('admin', 'scorer');
    const request = mockRequest({ user: { sub: 'user-1', role: 'scorer' } });
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.sent.statusCode).toBeUndefined();
  });

  it('passes when user is admin regardless of required roles', async () => {
    const handler = requireRole('scorer');
    const request = mockRequest({ user: { sub: 'user-1', roles: ['admin'] } });
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.sent.statusCode).toBeUndefined();
  });

  it('injects dev user when ALLOW_DEV_AUTH is enabled', async () => {
    env.ALLOW_DEV_AUTH = true;
    const handler = requireRole('admin');
    const request = mockRequest();
    const reply = mockReply();

    await handler(request, reply);

    expect((request as any).user).toEqual({
      sub: 'dev-user',
      role: 'admin',
      roles: ['admin', 'scorer'],
    });
    expect(reply.sent.statusCode).toBeUndefined();
  });
});

describe('requireAdminOrInternal', () => {
  const originalInternalToken = process.env.INTERNAL_API_TOKEN;

  afterEach(() => {
    if (originalInternalToken === undefined) {
      delete process.env.INTERNAL_API_TOKEN;
    } else {
      process.env.INTERNAL_API_TOKEN = originalInternalToken;
    }
  });

  it('passes with valid internal bearer token', async () => {
    process.env.INTERNAL_API_TOKEN = 'secret-internal-token';
    const request = mockRequest({
      headers: { authorization: 'Bearer secret-internal-token' },
    });
    const reply = mockReply();

    await requireAdminOrInternal(request, reply);

    expect(reply.sent.statusCode).toBeUndefined();
  });

  it('returns 401 when no user and no internal token', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const request = mockRequest();
    const reply = mockReply();

    await requireAdminOrInternal(request, reply);

    expect(reply.sent.statusCode).toBe(401);
  });

  it('returns 403 when authenticated user is not admin', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const request = mockRequest({ user: { sub: 'user-1', role: 'scorer' } });
    const reply = mockReply();

    await requireAdminOrInternal(request, reply);

    expect(reply.sent.statusCode).toBe(403);
    expect(reply.sent.payload).toEqual({
      error: { code: 'FORBIDDEN', message: 'Admin or internal access required' },
    });
  });

  it('passes when authenticated user is admin', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const request = mockRequest({ user: { sub: 'user-1', roles: ['admin'] } });
    const reply = mockReply();

    await requireAdminOrInternal(request, reply);

    expect(reply.sent.statusCode).toBeUndefined();
  });
});

describe('getUserId', () => {
  it('returns user sub when present', () => {
    const request = mockRequest({ user: { sub: 'user-123' } });

    expect(getUserId(request)).toBe('user-123');
  });

  it('falls back to x-user-id header', () => {
    const request = mockRequest({
      headers: { 'x-user-id': 'header-user' },
    });

    expect(getUserId(request)).toBe('header-user');
  });

  it('throws when no user identity is available', () => {
    const request = mockRequest();

    expect(() => getUserId(request)).toThrow('No user identity available');
  });
});
