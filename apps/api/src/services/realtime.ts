import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
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

/**
 * Initialize Socket.IO server with Redis adapter for horizontal scaling.
 * Event naming follows context.md section 6.2: match:{id}:<event_type>
 */
export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  // TODO: Add Redis adapter for multi-instance scaling
  // import { createAdapter } from '@socket.io/redis-adapter';
  // import { createClient } from 'ioredis';
  // const pubClient = new Redis(process.env.REDIS_URL);
  // const subClient = pubClient.duplicate();
  // io.adapter(createAdapter(pubClient, subClient));

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

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

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
