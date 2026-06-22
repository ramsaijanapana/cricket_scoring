import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMatchSocket } from './useMatchSocket';
import { useScoringStore } from '../stores/scoring-store';
import { WS_EVENTS } from '@cricket/shared';

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


  it('patches match cache on delivery without invalidating', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['match', 'match-1'], {
      id: 'match-1',
      status: 'live',
      currentScore: '0/0',
      currentOvers: '0.0',
      innings: [{
        id: 'inn-1',
        status: 'in_progress',
        totalRuns: 0,
        totalWickets: 0,
        totalOvers: 0,
      }],
    });

    const localWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useMatchSocket('match-1'), { wrapper: localWrapper });

    act(() => {
      handlers[WS_EVENTS.delivery('match-1')]({
        scorecard_snapshot: {
          innings_score: 4,
          innings_wickets: 0,
          innings_overs: '0.1',
          run_rate: 24,
        },
      });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    const updated = queryClient.getQueryData<any>(['match', 'match-1']);
    expect(updated.currentScore).toBe('4/0');
  });

  it('refetches match cache on over end', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useMatchSocket('match-1'), { wrapper: localWrapper });

    act(() => {
      handlers[WS_EVENTS.over('match-1')]({});
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['match', 'match-1'] });
  });

  it('leaves match and unsubscribes on cleanup', () => {
    const { unmount } = renderHook(() => useMatchSocket('match-1'), { wrapper });
    unmount();

    expect(leaveMatch).toHaveBeenCalledWith('match-1');
    expect(mockSocket.off).toHaveBeenCalledTimes(7);
  });
});
