import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { appUser } from '../db/schema/index';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const BCRYPT_COST = 12;
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function buildJwtPayload(user: { id: string; email: string; role: string }) {
  return {
    sub: user.id,
    email: user.email,
    roles: [user.role],
    permissions: [],
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /register
  app.post('/register', async (request, reply) => {
    const { email, password, displayName } = request.body as {
      email: string;
      password: string;
      displayName: string;
    };

    if (!email || !password || !displayName) {
      return reply.status(400).send({ error: 'email, password, and displayName are required' });
    }

    try {
      const existing = await db
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.email, email))
        .limit(1);

      if (existing.length > 0) {
        return reply.status(409).send({ error: 'A user with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

      const [user] = await db
        .insert(appUser)
        .values({
          email,
          passwordHash,
          displayName,
          role: 'spectator',
        })
        .returning({
          id: appUser.id,
          email: appUser.email,
          displayName: appUser.displayName,
          role: appUser.role,
        });

      return reply.status(201).send({ user });
    } catch (err) {
      request.log.error(err, 'Failed to register user');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /login
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required' });
    }

    try {
      const [user] = await db
        .select({
          id: appUser.id,
          email: appUser.email,
          displayName: appUser.displayName,
          role: appUser.role,
          passwordHash: appUser.passwordHash,
          isActive: appUser.isActive,
        })
        .from(appUser)
        .where(eq(appUser.email, email))
        .limit(1);

      if (!user) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      if (!user.isActive) {
        return reply.status(401).send({ error: 'Account is deactivated' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const payload = buildJwtPayload(user);

      const access_token = app.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRY });

      const refresh_token = randomUUID();
      await redis.set(
        `refresh:${refresh_token}`,
        JSON.stringify({ userId: user.id, email: user.email, role: user.role }),
        'EX',
        REFRESH_TOKEN_TTL_SECONDS,
      );

      return reply.send({
        access_token,
        refresh_token,
        expires_in: 3600,
      });
    } catch (err) {
      request.log.error(err, 'Failed to login');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /refresh
  app.post('/refresh', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token: string };

    if (!refresh_token) {
      return reply.status(400).send({ error: 'refresh_token is required' });
    }

    try {
      const stored = await redis.get(`refresh:${refresh_token}`);
      if (!stored) {
        return reply.status(401).send({ error: 'Invalid or expired refresh token' });
      }

      // Invalidate the old refresh token
      await redis.del(`refresh:${refresh_token}`);

      const userData = JSON.parse(stored) as {
        userId: string;
        email: string;
        role: string;
      };

      const payload = buildJwtPayload({
        id: userData.userId,
        email: userData.email,
        role: userData.role,
      });

      const access_token = app.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRY });

      const new_refresh_token = randomUUID();
      await redis.set(
        `refresh:${new_refresh_token}`,
        stored,
        'EX',
        REFRESH_TOKEN_TTL_SECONDS,
      );

      return reply.send({
        access_token,
        refresh_token: new_refresh_token,
        expires_in: 3600,
      });
    } catch (err) {
      request.log.error(err, 'Failed to refresh token');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /logout
  app.post('/logout', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token: string };

    if (!refresh_token) {
      return reply.status(400).send({ error: 'refresh_token is required' });
    }

    try {
      await redis.del(`refresh:${refresh_token}`);
      return reply.status(204).send();
    } catch (err) {
      request.log.error(err, 'Failed to logout');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /.well-known/jwks.json
  app.get('/.well-known/jwks.json', async (_request, reply) => {
    return reply.send({ keys: [] });
  });
};
