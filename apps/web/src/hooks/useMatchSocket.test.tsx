import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMatchSocket } from './useMatchSocket';
import { useScoringStore } from '../stores/scoring-store';
import { WS_EVENTS } from '../lib/socket';

const handlers: Record<string, (...args: unknown[]) => void> = {};

const mockSocket = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handler;
  }),
  off: vi.fn(),
};

vi.mock('../lib/socket', () => ({
  joinMatch: vi.fn(),
  leaveMatch: vi.fn(),
  getSocket: () => mockSocket,
  WS_EVENTS: {
    delivery: (matchId: string) => `match:${matchId}:delivery`,
    wicket: (matchId: string) => `match:${matchId}:wicket`,
    over: (matchId: string) => `match:${matchId}:over`,
    milestone: (matchId: string) => `match:${matchId}:milestone`,
    prediction: (matchId: string) => `match:${matchId}:prediction`,
    status: (matchId: string) => `match:${matchId}:status`,
    dlsUpdate: (matchId: string) => `match:${matchId}:dls_update`,
  },
}));

import { joinMatch, leaveMatch } from '../lib/socket';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useMatchSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    useScoringStore.getState().reset();
  });

  it('joins match and subscribes to WS events', () => {
    renderHook(() => useMatchSocket('match-1'), { wrapper });

    expect(joinMatch).toHaveBeenCalledWith('match-1');
    expect(mockSocket.on).toHaveBeenCalledTimes(7);
  });

  it('updates score and commentary on delivery event', () => {
    const { result } = renderHook(() => useMatchSocket('match-1'), { wrapper });
    const commentary = { id: 'c1', text: 'Four runs' };

    act(() => {
      handlers[WS_EVENTS.delivery('match-1')]({
        scorecard_snapshot: {
          innings_score: 10,
          innings_wickets: 0,
          innings_overs: '1.0',
          run_rate: 10,
        },
        commentary,
      });
    });

    expect(useScoringStore.getState().inningsScore).toBe(10);
    expect(result.current.latestCommentary).toEqual(commentary);
    expect(result.current.deliveryVersion).toBe(1);
  });

  it('sets milestone toast on milestone event', () => {
    const { result } = renderHook(() => useMatchSocket('match-1'), { wrapper });

    act(() => {
      handlers[WS_EVENTS.milestone('match-1')]({ text: 'Fifty!', type: 'fifty' });
    });

    expect(result.current.milestoneToast).toEqual({ text: 'Fifty!', type: 'fifty' });
  });

  it('leaves match and unsubscribes on cleanup', () => {
    const { unmount } = renderHook(() => useMatchSocket('match-1'), { wrapper });
    unmount();

    expect(leaveMatch).toHaveBeenCalledWith('match-1');
    expect(mockSocket.off).toHaveBeenCalledTimes(7);
  });
});
