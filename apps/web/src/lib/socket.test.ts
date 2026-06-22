import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSocket = {
  connected: false,
  connect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

describe('getSocket', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  it('passes access_token as handshake auth when logged in', async () => {
    localStorage.setItem('access_token', 'jwt-test-token');
    const { io } = await import('socket.io-client');
    const { getSocket } = await import('./socket');

    getSocket();

    expect(io).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        auth: { token: 'jwt-test-token' },
      }),
    );
  });

  it('omits auth when no access_token in localStorage', async () => {
    const { io } = await import('socket.io-client');
    const { getSocket } = await import('./socket');

    getSocket();

    expect(io).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        auth: undefined,
      }),
    );
  });
});
