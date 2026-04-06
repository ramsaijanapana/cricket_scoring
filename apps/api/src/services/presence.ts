/**
 * Spectator Presence Service — WebSocket room-based presence counting.
 *
 * Tracks connected clients per match room and broadcasts presence updates
 * when users join or leave. Integrates with the existing Socket.IO setup
 * in realtime.ts.
 */

import type { Server as SocketIOServer } from 'socket.io';

// ---------------------------------------------------------------------------
// In-memory presence store
// ---------------------------------------------------------------------------

/**
 * Map of matchId -> Set of socket IDs currently in the room.
 * We maintain our own count rather than relying solely on Socket.IO room size
 * for accurate tracking even when Redis adapter is in use.
 */
const matchPresence = new Map<string, Set<string>>();

/**
 * Reverse map: socketId -> Set of matchIds the socket has joined.
 * Used for efficient cleanup on disconnect.
 */
const socketMatches = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current spectator count for a match.
 */
export function getPresenceCount(matchId: string): number {
  return matchPresence.get(matchId)?.size ?? 0;
}

/**
 * Get presence counts for multiple matches.
 */
export function getPresenceCounts(matchIds: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of matchIds) {
    counts[id] = getPresenceCount(id);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function addToPresence(matchId: string, socketId: string): void {
  if (!matchPresence.has(matchId)) {
    matchPresence.set(matchId, new Set());
  }
  matchPresence.get(matchId)!.add(socketId);

  if (!socketMatches.has(socketId)) {
    socketMatches.set(socketId, new Set());
  }
  socketMatches.get(socketId)!.add(matchId);
}

function removeFromPresence(matchId: string, socketId: string): void {
  const sockets = matchPresence.get(matchId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      matchPresence.delete(matchId);
    }
  }

  const matches = socketMatches.get(socketId);
  if (matches) {
    matches.delete(matchId);
    if (matches.size === 0) {
      socketMatches.delete(socketId);
    }
  }
}

function removeSocket(socketId: string): string[] {
  const matches = socketMatches.get(socketId);
  if (!matches) return [];

  const affectedMatchIds = Array.from(matches);
  for (const matchId of affectedMatchIds) {
    const sockets = matchPresence.get(matchId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        matchPresence.delete(matchId);
      }
    }
  }

  socketMatches.delete(socketId);
  return affectedMatchIds;
}

// ---------------------------------------------------------------------------
// Socket.IO Integration
// ---------------------------------------------------------------------------

/**
 * Attach presence tracking to an existing Socket.IO server.
 * Call this after initSocketIO() in server.ts.
 *
 * Listens for join_match / leave_match events and disconnect,
 * then broadcasts `presence:update` events to the match room.
 */
export function attachPresenceTracking(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    // Track when a client joins a match room
    socket.on('join_match', ({ match_id }: { match_id: string }) => {
      addToPresence(match_id, socket.id);
      const count = getPresenceCount(match_id);

      // Broadcast updated presence count to the match room
      io.to(`match:${match_id}`).emit('presence:update', {
        matchId: match_id,
        count,
      });
    });

    // Track when a client leaves a match room
    socket.on('leave_match', ({ match_id }: { match_id: string }) => {
      removeFromPresence(match_id, socket.id);
      const count = getPresenceCount(match_id);

      io.to(`match:${match_id}`).emit('presence:update', {
        matchId: match_id,
        count,
      });
    });

    // Clean up on disconnect
    socket.on('disconnect', () => {
      const affectedMatchIds = removeSocket(socket.id);

      // Broadcast updated counts for all rooms this socket was in
      for (const matchId of affectedMatchIds) {
        const count = getPresenceCount(matchId);
        io.to(`match:${matchId}`).emit('presence:update', {
          matchId,
          count,
        });
      }
    });
  });
}
