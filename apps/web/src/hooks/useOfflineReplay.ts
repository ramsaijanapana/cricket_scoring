import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { offlineStore } from '../lib/offline-store';
import { useScoringStore } from '../stores/scoring-store';

export async function replayPendingDeliveries(
  matchId: string,
  setSyncStatus: (status: 'synced' | 'pending' | 'offline', count?: number) => void,
  invalidateMatch: () => void,
) {
  const pending = await offlineStore.getPendingDeliveries();
  const matchPending = pending
    .filter((d) => d.matchId === matchId)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (matchPending.length === 0) return;

  setSyncStatus('pending', matchPending.length);
  let syncedCount = 0;

  for (const entry of matchPending) {
    try {
      await api.recordDelivery(matchId, entry.payload);
      await offlineStore.markSynced(entry.id);
      syncedCount++;
      setSyncStatus('pending', matchPending.length - syncedCount);
    } catch {
      await offlineStore.markFailed(entry.id);
    }
  }

  invalidateMatch();

  const remaining = await offlineStore.getPendingDeliveries();
  const matchRemaining = remaining.filter((d) => d.matchId === matchId);
  if (matchRemaining.length === 0) {
    setSyncStatus('synced');
  } else {
    setSyncStatus('pending', matchRemaining.length);
  }
}

export function useOfflineReplay(matchId: string | undefined) {
  const queryClient = useQueryClient();
  const setSyncStatus = useScoringStore((s) => s.setSyncStatus);

  useEffect(() => {
    if (!matchId) return;

    const invalidateMatch = () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    };

    const handleOnline = () => {
      replayPendingDeliveries(matchId, setSyncStatus, invalidateMatch);
    };

    window.addEventListener('online', handleOnline);

    if (navigator.onLine) {
      replayPendingDeliveries(matchId, setSyncStatus, invalidateMatch);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [matchId, queryClient, setSyncStatus]);
}
