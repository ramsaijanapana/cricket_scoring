import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Namespace } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { db } from '../db/index';
import { chatMember } from '../db/schema/chat';
import { eq, and } from 'drizzle-orm';
import { env } from '../config';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DeliveryEvent,
  WicketEvent,
  OverEvent,
  MilestoneEvent,
  PredictionEvent,
  StatusEvent,
} from '@cricket/shared';

let io: SocketIOServer | null = null;
let socialNsp: Namespace | null = null;

/**
 * Initialize Socket.IO server with Redis adapter for horizontal scaling.
 * Event naming follows context.md section 6.2: match:{id}:<event_type>
 */
export async function initSocketIO(httpServer: HttpServer): Promise<SocketIOServer> {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.NODE_ENV === 'production'
        ? env.ALLOWED_ORIGINS.split(',')
        : '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for multi-instance horizontal scaling
  try {
    const pubClient = new Redis(env.REDIS_URL);
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.ping(), subClient.ping()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.IO Redis adapter connected');
  } catch (err) {
    console.warn('Socket.IO Redis adapter failed, running in single-instance mode:', err);
  }

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Client joins a match room — context.md section 6.2
    socket.on('join_match', ({ match_id }: { match_id: string }) => {
      socket.join(`match:${match_id}`);
      console.log(`${socket.id} joined match:${match_id}`);
    });

    socket.on('leave_match', ({ match_id }: { match_id: string }) => {
      socket.leave(`match:${match_id}`);
    });

    // Scorer submits delivery via WebSocket — context.md section 6.2
    socket.on('submit_delivery', async (data) => {
      // This is handled by the REST endpoint; WebSocket is for real-time push only
      // In a full implementation, this would call the scoring engine directly
      console.log('Delivery submitted via WebSocket:', data);
    });

    socket.on('undo_last_ball', async (data) => {
      console.log('Undo requested via WebSocket:', data);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // --- /social namespace for chat & notifications ---
  socialNsp = io.of('/social');

  socialNsp.on('connection', (socket) => {
    // Authenticate via x-user-id header or auth token
    const userId =
      (socket.handshake.headers['x-user-id'] as string) ||
      (socket.handshake.auth?.token as string) ||
      null;

    if (!userId) {
      console.log(`Social: rejected unauthenticated socket ${socket.id}`);
      socket.disconnect(true);
      return;
    }

    // Join personal notification room
    socket.join(`user:${userId}`);
    (socket as any).userId = userId;
    console.log(`Social: ${socket.id} authenticated as ${userId}`);

    // Join a chat room
    socket.on('chat:join', ({ roomId }: { roomId: string }) => {
      socket.join(`chat:${roomId}`);
      console.log(`Social: ${socket.id} joined chat:${roomId}`);
    });

    // Leave a chat room
    socket.on('chat:leave', ({ roomId }: { roomId: string }) => {
      socket.leave(`chat:${roomId}`);
    });

    // Typing indicator — broadcast to room (excluding sender)
    socket.on('chat:typing', ({ roomId }: { roomId: string }) => {
      socket.to(`chat:${roomId}`).emit('chat:typing', {
        roomId,
        userId,
      });
    });

    // Read receipt — update last_read_at in DB and notify room
    socket.on('chat:read', async ({ roomId }: { roomId: string }) => {
      try {
        await db
          .update(chatMember)
          .set({ lastReadAt: new Date() })
          .where(and(eq(chatMember.roomId, roomId), eq(chatMember.userId, userId)));

        socket.to(`chat:${roomId}`).emit('chat:read', {
          roomId,
          userId,
          readAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Social: chat:read error', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Social: ${socket.id} disconnected`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function getSocialNamespace(): Namespace {
  if (!socialNsp) throw new Error('Social namespace not initialized');
  return socialNsp;
}

/**
 * Broadcast social/chat events.
 */
export const socialBroadcast = {
  /** Emit a new chat message to everyone in the chat room */
  chatMessage(roomId: string, message: Record<string, unknown>) {
    getSocialNamespace().to(`chat:${roomId}`).emit('chat:message', { roomId, message });
  },

  /** Emit a notification to a specific user */
  notification(userId: string, notification: Record<string, unknown>) {
    getSocialNamespace().to(`user:${userId}`).emit('notification:new', notification);
  },
};

/**
 * Broadcast events to a match room.
 * Uses context.md event naming: match:{id}:<event_type>
 */
export const broadcast = {
  delivery(matchId: string, data: DeliveryEvent) {
    getIO().to(`match:${matchId}`).emit(`match:${matchId}:delivery`, data);
  },

  wicket(matchId: string, data: WicketEvent) {
    getIO().to(`match:${matchId}`).emit(`match:${matchId}:wicket`, data);
  },

  over(matchId: string, data: OverEvent) {
    getIO().to(`match:${matchId}`).emit(`match:${matchId}:over`, data);
  },

  milestone(matchId: string, data: MilestoneEvent) {
    getIO().to(`match:${matchId}`).emit(`match:${matchId}:milestone`, data);
  },

  prediction(matchId: string, data: PredictionEvent) {
    getIO().to(`match:${matchId}`).emit(`match:${matchId}:prediction`, data);
  },

  status(matchId: string, data: StatusEvent) {
    getIO().to(`match:${matchId}`).emit(`match:${matchId}:status`, data);
  },
};
