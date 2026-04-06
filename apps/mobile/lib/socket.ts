import { io, Socket } from "socket.io-client";
import { storage } from "./storage";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MatchEventType =
  | "delivery:new"
  | "wicket:new"
  | "over:complete"
  | "match:status";

export interface MatchEvent {
  type: MatchEventType;
  matchId: string;
  data: unknown;
}

type MatchEventCallback = (event: MatchEvent) => void;

// ─── State ──────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

let socket: Socket | null = null;
const listeners = new Set<MatchEventCallback>();
let currentRoom: string | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Establish a Socket.IO connection to the API server.
 * Reuses an existing connection if already connected.
 */
export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await storage.getToken();

  socket = io(API_BASE, {
    transports: ["websocket"],
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  // Bind global event handlers
  const EVENTS: MatchEventType[] = [
    "delivery:new",
    "wicket:new",
    "over:complete",
    "match:status",
  ];

  for (const eventType of EVENTS) {
    socket.on(eventType, (data: unknown) => {
      const event: MatchEvent = {
        type: eventType,
        matchId: currentRoom ?? "",
        data,
      };
      listeners.forEach((cb) => cb(event));
    });
  }

  socket.on("connect", () => {
    console.log("[socket] Connected:", socket?.id);
    // Re-join room after reconnect
    if (currentRoom) {
      socket?.emit("match:join", currentRoom);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log("[socket] Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] Connection error:", err.message);
  });

  return socket;
}

/**
 * Join a match room to receive real-time events for that match.
 */
export function joinMatchRoom(matchId: string): void {
  if (currentRoom && currentRoom !== matchId) {
    leaveMatchRoom(currentRoom);
  }
  currentRoom = matchId;
  socket?.emit("match:join", matchId);
}

/**
 * Leave a match room and stop receiving events.
 */
export function leaveMatchRoom(matchId: string): void {
  socket?.emit("match:leave", matchId);
  if (currentRoom === matchId) {
    currentRoom = null;
  }
}

/**
 * Register a callback for match events.
 * Returns an unsubscribe function.
 */
export function onMatchEvent(callback: MatchEventCallback): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Disconnect the socket and clean up all listeners.
 */
export function disconnectSocket(): void {
  if (currentRoom) {
    leaveMatchRoom(currentRoom);
  }
  listeners.clear();
  socket?.disconnect();
  socket = null;
}

/**
 * Returns true if the socket is currently connected.
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}
