import { FastifyRequest, FastifyReply } from 'fastify';

const isDev = process.env.NODE_ENV !== 'production';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;
  if (!user || !user.sub) {
    // In development, allow unauthenticated requests with a dev user
    if (isDev) {
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
      if (isDev) {
        (request as any).user = { sub: 'dev-user', role: 'admin', roles: ['admin', 'scorer'] };
        return;
      }
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    // Check if user has any of the required roles
    const userRoles: string[] = user.roles || [user.role || 'spectator'];
    const hasRole = roles.some(r => userRoles.includes(r)) || userRoles.includes('admin');

    if (!hasRole) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}

export function getUserId(request: FastifyRequest): string {
  const user = (request as any).user;
  if (user?.sub) return user.sub;
  // Fallback for dev/testing
  const header = request.headers['x-user-id'] as string | undefined;
  if (header) return header;
  throw new Error('No user identity available');
}
