import { createSigner, createVerifier } from 'fast-jwt';
import { eq } from 'drizzle-orm';
import { env } from '../config';
import { db } from '../db/index';
import { match } from '../db/schema/match';

export interface SocketJwtPayload {
  sub: string;
  email?: string;
  roles?: string[];
  role?: string;
}

export interface SocketIdentity {
  userId: string;
  roles: string[];
}

type HandshakeLike = {
  headers: Record<string, unknown>;
  auth?: Record<string, unknown>;
};

const verifyToken = createVerifier({ key: env.JWT_SECRET });

/** Verify an access token and return the JWT payload, or null if invalid. */
export function verifyAccessToken(token: string): SocketJwtPayload | null {
  if (!token) return null;
  try {
    const payload = verifyToken(token) as SocketJwtPayload;
    return payload?.sub ? payload : null;
  } catch {
    return null;
  }
}

/** Resolve socket identity from handshake auth. x-user-id is allowed only when ALLOW_DEV_AUTH is true. */
export function resolveSocketIdentity(handshake: HandshakeLike): SocketIdentity | null {
  const devUserId = handshake.headers['x-user-id'] as string | undefined;
  const token = handshake.auth?.token as string | undefined;

  if (env.ALLOW_DEV_AUTH && devUserId) {
    return { userId: devUserId, roles: ['admin', 'scorer'] };
  }

  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload) return null;

  const roles = payload.roles ?? (payload.role ? [payload.role] : ['spectator']);
  return { userId: payload.sub, roles };
}

export type MatchAccessRecord = {
  isPublic: boolean;
  isDeleted: boolean;
  matchOfficials?: unknown;
};

/** Check whether a user may join a match realtime room. Public matches are open; private matches require auth. */
export function canAccessMatch(
  matchRow: MatchAccessRecord,
  identity: SocketIdentity | null,
): boolean {
  if (matchRow.isDeleted) return false;
  if (matchRow.isPublic) return true;
  if (!identity) return false;

  const roles = identity.roles;
  if (roles.some((r) => ['admin', 'super_admin', 'tournament_admin'].includes(r))) {
    return true;
  }

  const officials = (matchRow.matchOfficials ?? {}) as Record<string, unknown>;
  const scorers = (officials.scorers as string[]) ?? [];
  return scorers.includes(identity.userId);
}

/** Load match from DB and check room access. */
export async function validateMatchRoomAccess(
  matchId: string,
  identity: SocketIdentity | null,
): Promise<boolean> {
  const row = await db.query.match.findFirst({
    where: eq(match.id, matchId),
    columns: { isPublic: true, isDeleted: true, matchOfficials: true },
  });

  if (!row) return false;
  return canAccessMatch(row, identity);
}

/** Test helper — signs a JWT compatible with verifyAccessToken. */
export function signTestAccessToken(payload: SocketJwtPayload): string {
  const sign = createSigner({ key: env.JWT_SECRET });
  return sign(payload);
}
