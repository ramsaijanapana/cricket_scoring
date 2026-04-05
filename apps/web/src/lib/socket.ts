import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WS_URL || '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function joinMatch(matchId: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit('join_match', { match_id: matchId });
}

export function leaveMatch(matchId: string) {
  const s = getSocket();
  s.emit('leave_match', { match_id: matchId });
}

// Event names per context.md section 6.2
export const WS_EVENTS = {
  delivery: (matchId: string) => `match:${matchId}:delivery`,
  wicket: (matchId: string) => `match:${matchId}:wicket`,
  over: (matchId: string) => `match:${matchId}:over`,
  milestone: (matchId: string) => `match:${matchId}:milestone`,
  prediction: (matchId: string) => `match:${matchId}:prediction`,
  dlsUpdate: (matchId: string) => `match:${matchId}:dls_update`,
  status: (matchId: string) => `match:${matchId}:status`,
} as const;
