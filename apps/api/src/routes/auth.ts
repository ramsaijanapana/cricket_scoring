import { FastifyPluginAsync } from 'fastify';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { appUser } from '../db/schema/index';
import { validateBody, registerSchema, loginSchema } from '../middleware/validation';
import { sanitizeUser } from '../middleware/serialize';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email-service';
import { env } from '../config';

const redis = new Redis(env.REDIS_URL);
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function buildJwtPayload(user: { id: string; email: string; role: string }) {
  return {
    sub: user.id,
    email: user.email,
    roles: [user.role],
    permissions: [],
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // --- Rate limiting for sensitive auth routes (per IP + path) ---
  const strictRateLimit = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (req: any) => `${req.ip}-${req.routeOptions?.url || req.url}`,
      },
    },
  };

  // POST /register
  app.post('/register', { ...strictRateLimit, preHandler: [validateBody(registerSchema)] }, async (request, reply) => {
    const { email, password, displayName } = (request as any).validated as {
      email: string;
      password: string;
      displayName: string;
    };

    try {
      const existing = await db
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.email, email))
        .limit(1);

      if (existing.length > 0) {
        return reply.status(409).send({ error: 'A user with this email already exists' });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        timeCost: 3,
        memoryCost: 65536,
        parallelism: 1,
      });

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

      // Generate email verification token
      const verifyToken = randomUUID();
      await redis.set(`verify:${verifyToken}`, user.id, 'EX', VERIFY_TOKEN_TTL_SECONDS);
      request.log.info({ verifyToken, userId: user.id }, 'Email verification token generated (dev)');
      await sendVerificationEmail(email, verifyToken);

      return reply.status(201).send({ user: sanitizeUser({ ...user, emailVerified: false }) });
    } catch (err) {
      request.log.error(err, 'Failed to register user');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /login
  app.post('/login', { ...strictRateLimit, preHandler: [validateBody(loginSchema)] }, async (request, reply) => {
    const { email, password } = (request as any).validated as {
      email: string;
      password: string;
    };

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

      const valid = await argon2.verify(user.passwordHash, password);
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

      // Track session in Redis set
      await redis.sadd(`sessions:${user.id}`, refresh_token);

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

      const userData = JSON.parse(stored) as {
        userId: string;
        email: string;
        role: string;
      };

      // Invalidate the old refresh token
      await redis.del(`refresh:${refresh_token}`);
      await redis.srem(`sessions:${userData.userId}`, refresh_token);

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

      // Track new session
      await redis.sadd(`sessions:${userData.userId}`, new_refresh_token);

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
      // Look up userId from refresh token to remove from sessions set
      const stored = await redis.get(`refresh:${refresh_token}`);
      if (stored) {
        const userData = JSON.parse(stored) as { userId: string };
        await redis.srem(`sessions:${userData.userId}`, refresh_token);
      }

      await redis.del(`refresh:${refresh_token}`);
      return reply.status(204).send();
    } catch (err) {
      request.log.error(err, 'Failed to logout');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── Password Reset Flow ────────────────────────────────────────────────

  // POST /forgot-password
  app.post('/forgot-password', { ...strictRateLimit }, async (request, reply) => {
    const { email } = request.body as { email: string };

    if (!email) {
      return reply.status(400).send({ error: 'email is required' });
    }

    try {
      const [user] = await db
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.email, email))
        .limit(1);

      if (user) {
        const resetToken = randomUUID();
        await redis.set(`reset:${resetToken}`, user.id, 'EX', RESET_TOKEN_TTL_SECONDS);
        request.log.info({ resetToken, userId: user.id }, 'Password reset token generated (dev)');
        await sendPasswordResetEmail(email, resetToken);
      }

      // Always return same response to prevent email enumeration
      return reply.send({ message: 'If email exists, reset link sent' });
    } catch (err) {
      request.log.error(err, 'Failed to process forgot-password');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /reset-password
  app.post('/reset-password', async (request, reply) => {
    const { token, newPassword } = request.body as { token: string; newPassword: string };

    if (!token || !newPassword) {
      return reply.status(400).send({ error: 'token and newPassword are required' });
    }

    try {
      const userId = await redis.get(`reset:${token}`);
      if (!userId) {
        return reply.status(400).send({ error: 'Invalid or expired reset token' });
      }

      const passwordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
        timeCost: 3,
        memoryCost: 65536,
        parallelism: 1,
      });

      await db
        .update(appUser)
        .set({ passwordHash })
        .where(eq(appUser.id, userId));

      // Delete the used reset token
      await redis.del(`reset:${token}`);

      return reply.send({ message: 'Password reset successful' });
    } catch (err) {
      request.log.error(err, 'Failed to reset password');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── Email Verification Flow ────────────────────────────────────────────

  // POST /verify-email
  app.post('/verify-email', async (request, reply) => {
    const { token } = request.body as { token: string };

    if (!token) {
      return reply.status(400).send({ error: 'token is required' });
    }

    try {
      const userId = await redis.get(`verify:${token}`);
      if (!userId) {
        return reply.status(400).send({ error: 'Invalid or expired verification token' });
      }

      // NOTE: appUser table does not yet have an emailVerified column.
      // Once a migration adds it, uncomment the update below:
      // await db.update(appUser).set({ emailVerified: true }).where(eq(appUser.id, userId));

      // For now, track verification in Redis
      await redis.set(`emailVerified:${userId}`, 'true');

      // Delete the used verification token
      await redis.del(`verify:${token}`);

      return reply.send({ message: 'Email verified successfully' });
    } catch (err) {
      request.log.error(err, 'Failed to verify email');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /resend-verification
  app.post('/resend-verification', async (request, reply) => {
    const { email } = request.body as { email: string };

    if (!email) {
      return reply.status(400).send({ error: 'email is required' });
    }

    try {
      const [user] = await db
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.email, email))
        .limit(1);

      if (!user) {
        // Don't reveal whether email exists
        return reply.send({ message: 'If email exists, verification link sent' });
      }

      const verifyToken = randomUUID();
      await redis.set(`verify:${verifyToken}`, user.id, 'EX', VERIFY_TOKEN_TTL_SECONDS);
      request.log.info({ verifyToken, userId: user.id }, 'Verification token re-generated (dev)');
      await sendVerificationEmail(email, verifyToken);

      return reply.send({ message: 'If email exists, verification link sent' });
    } catch (err) {
      request.log.error(err, 'Failed to resend verification');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── Session Management ─────────────────────────────────────────────────

  // GET /sessions — list active refresh tokens for authenticated user
  app.get('/sessions', async (request, reply) => {
    try {
      const decoded = await request.jwtVerify<{ sub: string }>();
      const userId = decoded.sub;

      const tokens = await redis.smembers(`sessions:${userId}`);

      // Filter out expired tokens (token exists in set but refresh key is gone)
      const sessions: { tokenId: string; active: boolean }[] = [];
      for (const token of tokens) {
        const exists = await redis.exists(`refresh:${token}`);
        if (exists) {
          sessions.push({ tokenId: token, active: true });
        } else {
          // Clean up stale entry
          await redis.srem(`sessions:${userId}`, token);
        }
      }

      return reply.send({ sessions });
    } catch (err) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
  });

  // DELETE /sessions/:tokenId — revoke a specific session
  app.delete('/sessions/:tokenId', async (request, reply) => {
    try {
      const decoded = await request.jwtVerify<{ sub: string }>();
      const userId = decoded.sub;
      const { tokenId } = request.params as { tokenId: string };

      // Verify the token belongs to this user
      const isMember = await redis.sismember(`sessions:${userId}`, tokenId);
      if (!isMember) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      // Revoke the refresh token and remove from sessions set
      await redis.del(`refresh:${tokenId}`);
      await redis.srem(`sessions:${userId}`, tokenId);

      return reply.send({ message: 'Session revoked' });
    } catch (err) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
  });

  // GET /.well-known/jwks.json
  app.get('/.well-known/jwks.json', async (_request, reply) => {
    return reply.send({ keys: [] });
  });
};
