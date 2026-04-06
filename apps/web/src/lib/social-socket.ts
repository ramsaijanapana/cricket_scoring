import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WS_URL || '';

let socialSocket: Socket | null = null;

/**
 * Get or create the Socket.IO /social namespace connection.
 * Used for notifications, chat, and social features.
 */
export function getSocialSocket(): Socket {
  if (!socialSocket) {
    const token = localStorage.getItem('access_token');
    const userId = localStorage.getItem('user_id') || 'dev-user';

    socialSocket = io(`${SOCKET_URL}/social`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
      auth: { token },
      extraHeaders: {
        'x-user-id': userId,
      },
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
 * Join a chat room for real-time messages.
 */
export function joinChatRoom(roomId: string) {
  const s = getSocialSocket();
  s.emit('chat:join', { roomId });
}

/**
 * Leave a chat room.
 */
export function leaveChatRoom(roomId: string) {
  const s = getSocialSocket();
  s.emit('chat:leave', { roomId });
}

/**
 * Send typing indicator to a chat room.
 */
export function sendTypingIndicator(roomId: string) {
  const s = getSocialSocket();
  s.emit('chat:typing', { roomId });
}

/**
 * Send read receipt for a chat room.
 */
export function sendReadReceipt(roomId: string) {
  const s = getSocialSocket();
  s.emit('chat:read', { roomId });
}
