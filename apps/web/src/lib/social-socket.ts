import { io, Socket } from 'socket.io-client';
import { parseJwtPayload } from './api';

const SOCKET_URL = import.meta.env.VITE_WS_URL || '';

let socialSocket: Socket | null = null;

function resolveUserId(token: string | null): string | null {
  if (token) {
    const payload = parseJwtPayload(token);
    if (payload?.sub) return payload.sub;
  }

  const storedUserId = localStorage.getItem('user_id');
  if (storedUserId) return storedUserId;

  if (import.meta.env.DEV) {
    return 'dev-user';
  }

  return null;
}

/**
 * Get or create the Socket.IO /social namespace connection.
 * Used for notifications, chat, and social features.
 * Returns null in production when the user is not authenticated.
 */
export function getSocialSocket(): Socket | null {
  const token = localStorage.getItem('access_token');
  const userId = resolveUserId(token);

  if (!token && import.meta.env.PROD) {
    return null;
  }

  if (import.meta.env.PROD && !userId) {
    return null;
  }

  if (!socialSocket) {
    const headers: Record<string, string> = {};
    if (userId) {
      headers['x-user-id'] = userId;
    }

    socialSocket = io(`${SOCKET_URL}/social`, {
      autoConnect: Boolean(token || import.meta.env.DEV),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
      extraHeaders: headers,
    });

    socialSocket.on('connect', () => {
      console.log('Social socket connected');
    });

    socialSocket.on('disconnect', () => {
      console.log('Social socket disconnected');
    });
  }

  return socialSocket;
}

/**
 * Reset the cached socket (e.g. after logout).
 */
export function resetSocialSocket() {
  if (socialSocket) {
    socialSocket.disconnect();
    socialSocket = null;
  }
}

/**
 * Join a chat room for real-time messages.
 */
export function joinChatRoom(roomId: string) {
  const s = getSocialSocket();
  s?.emit('chat:join', { roomId });
}

/**
 * Leave a chat room.
 */
export function leaveChatRoom(roomId: string) {
  const s = getSocialSocket();
  s?.emit('chat:leave', { roomId });
}

/**
 * Send typing indicator to a chat room.
 */
export function sendTypingIndicator(roomId: string) {
  const s = getSocialSocket();
  s?.emit('chat:typing', { roomId });
}

/**
 * Send read receipt for a chat room.
 */
export function sendReadReceipt(roomId: string) {
  const s = getSocialSocket();
  s?.emit('chat:read', { roomId });
}
