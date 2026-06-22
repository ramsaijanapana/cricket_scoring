import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;
  if (!user || !user.sub) {
    if (env.ALLOW_DEV_AUTH) {
      (request as any).user = { sub: 'dev-user', role: 'admin', roles: ['admin', 'scorer'] };
      return;
    }
    return reply.status(401).send({ error: 'Authentication required' });
  }
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user?.sub) {
      if (env.ALLOW_DEV_AUTH) {
        (request as any).user = { sub: 'dev-user', role: 'admin', roles: ['admin', 'scorer'] };
        return;
      }
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const userRoles: string[] = user.roles || [user.role || 'spectator'];
    const hasRole = roles.some(r => userRoles.includes(r)) || userRoles.includes('admin');

    if (!hasRole) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}

/** Protect metrics/APM endpoints: admin JWT or internal bearer token. */
export async function requireAdminOrInternal(request: FastifyRequest, reply: FastifyReply) {
  const internalToken = process.env.INTERNAL_API_TOKEN;
  const authHeader = request.headers.authorization;

  if (internalToken && authHeader === `Bearer ${internalToken}`) {
    return;
  }

  const user = (request as any).user;
  if (!user?.sub) {
    return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  const userRoles: string[] = user.roles || [user.role || 'spectator'];
  if (userRoles.includes('admin')) {
    return;
  }

  return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin or internal access required' } });
}

export function getUserId(request: FastifyRequest): string {
  const user = (request as any).user;
  if (user?.sub) return user.sub;
  // Fallback for dev/testing
  const header = request.headers['x-user-id'] as string | undefined;
  if (header) return header;
  throw new Error('No user identity available');
}
