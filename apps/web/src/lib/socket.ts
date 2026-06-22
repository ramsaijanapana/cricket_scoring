import { io, Socket } from 'socket.io-client';
import { WS_EVENTS as SHARED_WS_EVENTS } from '@cricket/shared';

export const WS_EVENTS = {
  ...SHARED_WS_EVENTS,
  presenceUpdate: 'presence:update',
} as const;

const SOCKET_URL = import.meta.env.VITE_WS_URL || '';

let socket: Socket | null = null;

function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

export function getSocket(): Socket {
  if (!socket) {
    const token = getAccessToken();

    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
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
