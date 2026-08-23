import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { replayPendingDeliveries, useOfflineReplay } from './useOfflineReplay';
import { offlineStore } from '../lib/offline-store';
import { useScoringStore } from '../stores/scoring-store';
import { api } from '../lib/api';

const emptyRecordDeliveryResult = {} as Awaited<ReturnType<typeof api.recordDelivery>>;

vi.mock('../lib/api', () => ({
  api: {
    recordDelivery: vi.fn().mockResolvedValue({}),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('replayPendingDeliveries', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    vi.mocked(api.recordDelivery).mockClear().mockResolvedValue(emptyRecordDeliveryResult);
    useScoringStore.setState({ syncStatus: 'synced', pendingCount: 0 });
  });

  it('syncs pending deliveries for the match in order', async () => {
    await offlineStore.queueDelivery('match-1', { runs: 1 });
    await offlineStore.queueDelivery('match-2', { runs: 2 });
    await offlineStore.queueDelivery('match-1', { runs: 4 });

    const setSyncStatus = vi.fn();
    const invalidateMatch = vi.fn();

    await replayPendingDeliveries('match-1', setSyncStatus, invalidateMatch);

    expect(api.recordDelivery).toHaveBeenCalledTimes(2);
    expect(setSyncStatus).toHaveBeenLastCalledWith('synced');
    expect(invalidateMatch).toHaveBeenCalledTimes(1);

    const remaining = await offlineStore.getPendingDeliveries();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].matchId).toBe('match-2');
  });

  it('marks failed deliveries and keeps pending count', async () => {
    await offlineStore.queueDelivery('match-1', { runs: 1 });
    vi.mocked(api.recordDelivery).mockRejectedValueOnce(new Error('network'));

    const setSyncStatus = vi.fn();
    await replayPendingDeliveries('match-1', setSyncStatus, vi.fn());

    expect(setSyncStatus).toHaveBeenLastCalledWith('pending', 1);
    const remaining = await offlineStore.getPendingDeliveries();
    expect(remaining).toHaveLength(1);
  });
});

describe('useOfflineReplay', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    vi.mocked(api.recordDelivery).mockClear().mockResolvedValue(emptyRecordDeliveryResult);
    useScoringStore.setState({ syncStatus: 'synced', pendingCount: 0 });
  });

  it('replays pending deliveries on mount when online', async () => {
    await offlineStore.queueDelivery('match-1', { runs: 1 });

    renderHook(() => useOfflineReplay('match-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(api.recordDelivery).toHaveBeenCalledWith('match-1', { runs: 1 });
    });
  });
});
