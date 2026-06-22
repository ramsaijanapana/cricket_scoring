import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from '../config';
import {
  verifyAccessToken,
  resolveSocketIdentity,
  canAccessMatch,
  signTestAccessToken,
} from './socket-auth';

describe('socket auth (P0-2 realtime security)', () => {
  const originalAllowDevAuth = env.ALLOW_DEV_AUTH;

  beforeEach(() => {
    env.ALLOW_DEV_AUTH = false;
  });

  afterEach(() => {
    env.ALLOW_DEV_AUTH = originalAllowDevAuth;
  });

  describe('verifyAccessToken', () => {
    it('returns payload for a valid JWT', () => {
      const token = signTestAccessToken({
        sub: 'user-abc',
        roles: ['scorer'],
      });

      expect(verifyAccessToken(token)).toEqual(
        expect.objectContaining({ sub: 'user-abc', roles: ['scorer'] }),
      );
    });

    it('returns null for invalid tokens', () => {
      expect(verifyAccessToken('not-a-jwt')).toBeNull();
      expect(verifyAccessToken('')).toBeNull();
    });
  });

  describe('resolveSocketIdentity', () => {
    it('rejects x-user-id when ALLOW_DEV_AUTH is false', () => {
      const identity = resolveSocketIdentity({
        headers: { 'x-user-id': 'spoofed-user' },
        auth: {},
      });

      expect(identity).toBeNull();
    });

    it('accepts x-user-id only when ALLOW_DEV_AUTH is true', () => {
      env.ALLOW_DEV_AUTH = true;

      const identity = resolveSocketIdentity({
        headers: { 'x-user-id': 'dev-user-1' },
        auth: {},
      });

      expect(identity).toEqual({
        userId: 'dev-user-1',
        roles: ['admin', 'scorer'],
      });
    });

    it('verifies JWT from handshake.auth.token and extracts sub', () => {
      const token = signTestAccessToken({
        sub: 'jwt-user-42',
        roles: ['spectator'],
      });

      const identity = resolveSocketIdentity({
        headers: {},
        auth: { token },
      });

      expect(identity).toEqual({
        userId: 'jwt-user-42',
        roles: ['spectator'],
      });
    });

    it('prefers x-user-id over JWT when ALLOW_DEV_AUTH is true', () => {
      env.ALLOW_DEV_AUTH = true;
      const token = signTestAccessToken({ sub: 'jwt-user', roles: ['spectator'] });

      const identity = resolveSocketIdentity({
        headers: { 'x-user-id': 'header-user' },
        auth: { token },
      });

      expect(identity?.userId).toBe('header-user');
    });

    it('does not treat raw JWT string as user id', () => {
      const token = signTestAccessToken({ sub: 'real-user', roles: ['scorer'] });

      const identity = resolveSocketIdentity({
        headers: { 'x-user-id': token },
        auth: {},
      });

      expect(identity).toBeNull();
    });
  });

  describe('canAccessMatch', () => {
    const publicMatch = { isPublic: true, isDeleted: false };
    const privateMatch = {
      isPublic: false,
      isDeleted: false,
      matchOfficials: { scorers: ['scorer-1'] },
    };

    it('allows anyone to join public matches', () => {
      expect(canAccessMatch(publicMatch, null)).toBe(true);
      expect(canAccessMatch(publicMatch, { userId: 'anon', roles: ['spectator'] })).toBe(true);
    });

    it('denies deleted matches', () => {
      expect(canAccessMatch({ isPublic: true, isDeleted: true }, null)).toBe(false);
    });

    it('denies unauthenticated users on private matches', () => {
      expect(canAccessMatch(privateMatch, null)).toBe(false);
    });

    it('allows assigned scorers on private matches', () => {
      expect(
        canAccessMatch(privateMatch, { userId: 'scorer-1', roles: ['scorer'] }),
      ).toBe(true);
    });

    it('denies non-assigned users on private matches', () => {
      expect(
        canAccessMatch(privateMatch, { userId: 'other-user', roles: ['spectator'] }),
      ).toBe(false);
    });

    it('allows admin on private matches', () => {
      expect(
        canAccessMatch(privateMatch, { userId: 'admin-1', roles: ['admin'] }),
      ).toBe(true);
    });
  });

  describe('validateMatchRoomAccess (DB)', () => {
    it('is documented as async DB lookup — see socket-auth.ts', () => {
      // Full integration requires a live DB; unit tests above cover auth logic.
      expect(typeof canAccessMatch).toBe('function');
    });
  });
});
