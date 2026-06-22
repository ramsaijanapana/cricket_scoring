import { io, Socket } from "socket.io-client";
import { storage } from "./storage";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MatchEventType = "delivery" | "wicket" | "over" | "status";

export interface MatchEvent {
  type: MatchEventType;
  matchId: string;
  data: unknown;
}

type MatchEventCallback = (event: MatchEvent) => void;

const WS_EVENTS: MatchEventType[] = ["delivery", "wicket", "over", "status"];

function wsEventName(matchId: string, type: MatchEventType): string {
  return `match:${matchId}:${type}`;
}

// ─── State ──────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ||
  "http://localhost:3000";

let socket: Socket | null = null;
const listeners = new Set<MatchEventCallback>();
let currentRoom: string | null = null;
const boundHandlers = new Map<string, (data: unknown) => void>();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Establish a Socket.IO connection to the API server.
 * Reuses an existing connection if already connected.
 */
export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await storage.getToken();

  socket = io(API_BASE, {
    transports: ["websocket", "polling"],
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    console.log("[socket] Connected:", socket?.id);
    if (currentRoom) {
      socket?.emit("join_match", { match_id: currentRoom });
      bindMatchEvents(currentRoom);
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

function bindMatchEvents(matchId: string): void {
  if (!socket) return;

  for (const type of WS_EVENTS) {
    const eventName = wsEventName(matchId, type);
    if (boundHandlers.has(eventName)) continue;

    const handler = (data: unknown) => {
      const event: MatchEvent = { type, matchId, data };
      listeners.forEach((cb) => cb(event));
    };

    boundHandlers.set(eventName, handler);
    socket.on(eventName, handler);
  }
}

function unbindMatchEvents(matchId: string): void {
  if (!socket) return;

  for (const type of WS_EVENTS) {
    const eventName = wsEventName(matchId, type);
    const handler = boundHandlers.get(eventName);
    if (handler) {
      socket.off(eventName, handler);
      boundHandlers.delete(eventName);
    }
  }
}

/**
 * Join a match room to receive real-time events for that match.
 */
export function joinMatchRoom(matchId: string): void {
  if (currentRoom && currentRoom !== matchId) {
    leaveMatchRoom(currentRoom);
  }
  currentRoom = matchId;
  if (!socket?.connected) {
    void connectSocket();
    return;
  }
  socket.emit("join_match", { match_id: matchId });
  bindMatchEvents(matchId);
}

/**
 * Leave a match room and stop receiving events.
 */
export function leaveMatchRoom(matchId: string): void {
  socket?.emit("leave_match", { match_id: matchId });
  unbindMatchEvents(matchId);
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
  boundHandlers.clear();
  socket?.disconnect();
  socket = null;
}

/**
 * Returns true if the socket is currently connected.
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}
