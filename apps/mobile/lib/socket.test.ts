import { describe, it, expect, vi, beforeEach } from 'vitest';

type SocketHandler = (data?: unknown) => void;

const mockSocket = {
  connected: false,
  id: 'socket-1',
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
};

const eventHandlers = new Map<string, SocketHandler>();

mockSocket.on.mockImplementation((event: string, handler: SocketHandler) => {
  eventHandlers.set(event, handler);
});

mockSocket.off.mockImplementation((event: string) => {
  eventHandlers.delete(event);
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock('./storage', () => ({
  storage: {
    getToken: vi.fn().mockResolvedValue(null),
  },
}));

import { storage } from './storage';

describe('connectSocket', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    eventHandlers.clear();
    mockSocket.connected = false;
    vi.resetModules();
    vi.mocked(storage.getToken).mockResolvedValue(null);
  });

  it('passes auth token when storage has a token', async () => {
    vi.mocked(storage.getToken).mockResolvedValue('jwt-mobile');
    const { io } = await import('socket.io-client');
    const { connectSocket } = await import('./socket');

    await connectSocket();

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: 'jwt-mobile' },
        reconnection: true,
      }),
    );
  });

  it('omits auth when no token is stored', async () => {
    const { io } = await import('socket.io-client');
    const { connectSocket } = await import('./socket');

    await connectSocket();

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: undefined,
      }),
    );
  });

  it('reuses an existing connected socket', async () => {
    const { io } = await import('socket.io-client');
    const { connectSocket } = await import('./socket');

    mockSocket.connected = true;
    const first = await connectSocket();
    const second = await connectSocket();

    expect(first).toBe(second);
    expect(io).toHaveBeenCalledTimes(1);
  });
});

describe('match room lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    eventHandlers.clear();
    mockSocket.connected = false;
    vi.resetModules();
    vi.mocked(storage.getToken).mockResolvedValue(null);
    const { disconnectSocket } = await import('./socket');
    disconnectSocket();
  });

  it('joinMatchRoom emits join_match when connected', async () => {
    const { connectSocket, joinMatchRoom } = await import('./socket');

    mockSocket.connected = true;
    await connectSocket();
    joinMatchRoom('match-42');

    expect(mockSocket.emit).toHaveBeenCalledWith('join_match', { match_id: 'match-42' });
    expect(mockSocket.on).toHaveBeenCalledWith('match:match-42:delivery', expect.any(Function));
  });

  it('leaveMatchRoom emits leave_match and unbinds handlers', async () => {
    const { connectSocket, joinMatchRoom, leaveMatchRoom } = await import('./socket');

    mockSocket.connected = true;
    await connectSocket();
    joinMatchRoom('match-42');
    leaveMatchRoom('match-42');

    expect(mockSocket.emit).toHaveBeenCalledWith('leave_match', { match_id: 'match-42' });
    expect(mockSocket.off).toHaveBeenCalledWith('match:match-42:delivery', expect.any(Function));
  });

  it('joinMatchRoom leaves previous room when switching matches', async () => {
    const { connectSocket, joinMatchRoom } = await import('./socket');

    mockSocket.connected = true;
    await connectSocket();
    joinMatchRoom('match-a');
    joinMatchRoom('match-b');

    expect(mockSocket.emit).toHaveBeenCalledWith('leave_match', { match_id: 'match-a' });
    expect(mockSocket.emit).toHaveBeenLastCalledWith('join_match', { match_id: 'match-b' });
  });
});

describe('match event listeners', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    eventHandlers.clear();
    mockSocket.connected = true;
    vi.resetModules();
    const { disconnectSocket } = await import('./socket');
    disconnectSocket();
    mockSocket.connected = true;
  });

  it('onMatchEvent forwards socket events to subscribers', async () => {
    const { connectSocket, joinMatchRoom, onMatchEvent } = await import('./socket');
    const received: unknown[] = [];

    mockSocket.connected = true;
    await connectSocket();
    joinMatchRoom('match-99');
    onMatchEvent((event) => received.push(event));

    const handler = eventHandlers.get('match:match-99:wicket');
    expect(handler).toBeDefined();
    handler?.({ player: 'p1' });

    expect(received).toEqual([
      {
        type: 'wicket',
        matchId: 'match-99',
        data: { player: 'p1' },
      },
    ]);
  });

  it('onMatchEvent unsubscribe removes the callback', async () => {
    const { onMatchEvent } = await import('./socket');
    const callback = vi.fn();
    const unsubscribe = onMatchEvent(callback);

    unsubscribe();
    eventHandlers.get('match:match-99:status')?.({ status: 'live' });

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('disconnectSocket', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    eventHandlers.clear();
    mockSocket.connected = true;
    vi.resetModules();
  });

  it('disconnects socket and clears connection state', async () => {
    const { connectSocket, joinMatchRoom, disconnectSocket, isSocketConnected } =
      await import('./socket');

    mockSocket.connected = true;
    await connectSocket();
    joinMatchRoom('match-1');
    disconnectSocket();

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(isSocketConnected()).toBe(false);
  });
});
