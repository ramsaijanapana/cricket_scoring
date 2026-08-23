import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config';

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  passwordHash: 'hash',
  role: 'spectator',
  avatarUrl: 'https://example.com/avatar.jpg',
  isActive: true,
  emailVerified: false,
  playerId: null,
  teamId: null,
  bio: 'Cricket fan',
  city: 'London',
  country: 'UK',
  battingStyle: null,
  bowlingStyle: null,
  preferredFormats: null,
  ballTypePreference: null,
  primaryRole: null,
  isPublic: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

vi.mock('../db/index', () => ({
  db: {
    query: {
      appUser: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('../services/storage-service', () => ({
  uploadFile: vi.fn(),
}));

import { db } from '../db/index';
import { userRoutes } from './users';

describe('GET /users/me', () => {
  let app: ReturnType<typeof Fastify>;
  const originalAllowDevAuth = env.ALLOW_DEV_AUTH;

  beforeAll(async () => {
    env.ALLOW_DEV_AUTH = false;
    app = Fastify();
    await app.register(fastifyJwt, { secret: 'test-secret' });

    app.addHook('onRequest', async (request: FastifyRequest) => {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = await request.jwtVerify();
          (request as any).user = decoded;
        } catch {
          // leave user unset — route preHandler will reject
        }
      }
    });

    await app.register(userRoutes, { prefix: '/api/v1/users' });
    await app.ready();
  });

  afterAll(async () => {
    env.ALLOW_DEV_AUTH = originalAllowDevAuth;
    await app.close();
  });

  beforeEach(() => {
    vi.mocked(db.query.appUser.findFirst).mockReset();
  });

  it('returns 401 without authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Authentication required' });
  });

  it('returns sanitized user profile for authenticated request', async () => {
    vi.mocked(db.query.appUser.findFirst).mockResolvedValueOnce(mockUser as any);

    const token = app.jwt.sign({ sub: 'user-123', roles: ['spectator'] });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'spectator',
      avatarUrl: 'https://example.com/avatar.jpg',
      bio: 'Cricket fan',
      city: 'London',
      country: 'UK',
    });
    expect(body.passwordHash).toBeUndefined();
    expect(db.query.appUser.findFirst).toHaveBeenCalledOnce();
  });

  it('returns 404 when user not found in database', async () => {
    vi.mocked(db.query.appUser.findFirst).mockResolvedValueOnce(undefined);

    const token = app.jwt.sign({ sub: 'missing-user', roles: ['spectator'] });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'User not found' });
  });
});
