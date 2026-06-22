import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockDb,
  mockGetNetworkState,
  mockAddNetworkListener,
  mockRecordDelivery,
  mockGetDeliveries,
  mockUndoLastBall,
} = vi.hoisted(() => ({
  mockDb: {
    execAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
  },
  mockGetNetworkState: vi.fn(),
  mockAddNetworkListener: vi.fn(),
  mockRecordDelivery: vi.fn(),
  mockGetDeliveries: vi.fn(),
  mockUndoLastBall: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock('expo-network', () => ({
  getNetworkStateAsync: (...args: unknown[]) => mockGetNetworkState(...args),
  addNetworkStateListener: (...args: unknown[]) => mockAddNetworkListener(...args),
}));

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
}));

vi.mock('./api', () => ({
  api: {
    recordDelivery: (...args: unknown[]) => mockRecordDelivery(...args),
    getDeliveries: (...args: unknown[]) => mockGetDeliveries(...args),
    undoLastBall: (...args: unknown[]) => mockUndoLastBall(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    details?: unknown;

    constructor(message: string, status: number, code?: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
}));

import { ApiError } from './api';

function baseMatch() {
  return {
    id: 'm1',
    innings: [
      {
        inningsNumber: 1,
        status: 'in_progress',
        totalRuns: 10,
        totalWickets: 1,
        totalOvers: '2.3',
        battingScorecard: [
          { playerId: 'p1', runsScored: 8, ballsFaced: 12, isOut: false },
        ],
        bowlingScorecard: [
          { playerId: 'p2', runsConceded: 10, wicketsTaken: 1 },
        ],
      },
    ],
    thisOver: [{ runs: 1, isWicket: false, extraType: null }],
  };
}

function deliveryPayload(overrides: Record<string, unknown> = {}) {
  return {
    innings_num: 1,
    striker_id: 'p1',
    non_striker_id: 'p3',
    bowler_id: 'p2',
    runs_batsman: 4,
    runs_extras: 0,
    is_wicket: false,
    extra_type: null,
    wicket_type: null,
    dismissed_player_id: null,
    fielder_id: null,
    is_dead_ball: false,
    client_id: 'c1',
    expected_stack_pos: 0,
    ...overrides,
  };
}

describe('offline-sync connectivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetNetworkState.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('isOnline returns true when connected and internet reachable', async () => {
    const { isOnline } = await import('./offline-sync');
    await expect(isOnline()).resolves.toBe(true);
  });

  it('isOnline returns false when disconnected', async () => {
    mockGetNetworkState.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    const { isOnline } = await import('./offline-sync');
    await expect(isOnline()).resolves.toBe(false);
  });

  it('isOnline returns false when network lookup throws', async () => {
    mockGetNetworkState.mockRejectedValue(new Error('network unavailable'));
    const { isOnline } = await import('./offline-sync');
    await expect(isOnline()).resolves.toBe(false);
  });
});

describe('offline-sync queue and counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('queueDelivery inserts payload into sqlite', async () => {
    const { queueDelivery } = await import('./offline-sync');
    const payload = deliveryPayload();

    await queueDelivery('m1', payload);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pending_deliveries'),
      ['m1', JSON.stringify(payload)],
    );
  });

  it('getPendingCount returns sqlite count without match filter', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 3 });
    const { getPendingCount } = await import('./offline-sync');

    await expect(getPendingCount()).resolves.toBe(3);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE synced = 0'),
    );
  });

  it('getPendingCount filters by matchId when provided', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 2 });
    const { getPendingCount } = await import('./offline-sync');

    await expect(getPendingCount('m1')).resolves.toBe(2);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('matchId = ?'),
      ['m1'],
    );
  });
});

describe('offline-sync undo stack position', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('getUndoStackPos returns 0 when no row exists', async () => {
    mockDb.getFirstAsync.mockResolvedValue(undefined);
    const { getUndoStackPos } = await import('./offline-sync');

    await expect(getUndoStackPos('m1')).resolves.toBe(0);
  });

  it('setUndoStackPos upserts match sync state', async () => {
    const { setUndoStackPos } = await import('./offline-sync');

    await setUndoStackPos('m1', 5);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('match_sync_state'),
      ['m1', 5],
    );
  });

  it('refreshUndoStackPos returns cached pos when offline', async () => {
    mockGetNetworkState.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    mockDb.getFirstAsync.mockResolvedValue({ undoStackPos: 7 });
    const { refreshUndoStackPos } = await import('./offline-sync');

    await expect(refreshUndoStackPos('m1')).resolves.toBe(7);
    expect(mockGetDeliveries).not.toHaveBeenCalled();
  });

  it('refreshUndoStackPos fetches from API when online', async () => {
    mockGetNetworkState.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    mockGetDeliveries.mockResolvedValue([{ undoStackPos: 4 }]);
    const { refreshUndoStackPos } = await import('./offline-sync');

    await expect(refreshUndoStackPos('m1')).resolves.toBe(4);
    expect(mockGetDeliveries).toHaveBeenCalledWith('m1');
  });
});

describe('applyOptimisticDelivery', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('updates innings totals and scorecards for a legal delivery', async () => {
    const { applyOptimisticDelivery } = await import('./offline-sync');
    const match = baseMatch();
    const payload = deliveryPayload({ runs_batsman: 4 });

    const updated = applyOptimisticDelivery(match, payload);

    expect(updated.innings[0].totalRuns).toBe(14);
    expect(updated.innings[0].totalOvers).toBe('2.4');
    expect(updated.innings[0].battingScorecard[0].runsScored).toBe(12);
    expect(updated.innings[0].battingScorecard[0].ballsFaced).toBe(13);
    expect(updated.innings[0].bowlingScorecard[0].runsConceded).toBe(14);
    expect(updated.thisOver).toHaveLength(2);
  });

  it('increments wickets and marks striker out', async () => {
    const { applyOptimisticDelivery } = await import('./offline-sync');
    const match = baseMatch();
    const payload = deliveryPayload({ is_wicket: true, runs_batsman: 0 });

    const updated = applyOptimisticDelivery(match, payload);

    expect(updated.innings[0].totalWickets).toBe(2);
    expect(updated.innings[0].battingScorecard[0].isOut).toBe(true);
    expect(updated.innings[0].bowlingScorecard[0].wicketsTaken).toBe(2);
  });

  it('returns match unchanged when no in-progress innings match', async () => {
    const { applyOptimisticDelivery } = await import('./offline-sync');
    const match = {
      ...baseMatch(),
      innings: [{ inningsNumber: 1, status: 'completed' }],
    };

    const updated = applyOptimisticDelivery(match, deliveryPayload());

    expect(updated).toBe(match);
  });

  it('does not advance overs on a wide', async () => {
    const { applyOptimisticDelivery } = await import('./offline-sync');
    const match = baseMatch();
    const payload = deliveryPayload({ extra_type: 'wide', runs_extras: 1, runs_batsman: 0 });

    const updated = applyOptimisticDelivery(match, payload);

    expect(updated.innings[0].totalOvers).toBe('2.3');
    expect(updated.innings[0].battingScorecard[0].ballsFaced).toBe(12);
  });
});

describe('reverseOptimisticDelivery', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reverts applyOptimisticDelivery for a legal delivery', async () => {
    const { applyOptimisticDelivery, reverseOptimisticDelivery } = await import('./offline-sync');
    const match = baseMatch();
    const payload = deliveryPayload();

    const updated = applyOptimisticDelivery(match, payload);
    const reverted = reverseOptimisticDelivery(updated, payload);

    expect(reverted.innings[0].totalRuns).toBe(match.innings[0].totalRuns);
    expect(reverted.innings[0].totalOvers).toBe(match.innings[0].totalOvers);
    expect(reverted.innings[0].battingScorecard[0].runsScored).toBe(8);
    expect(reverted.thisOver).toHaveLength(match.thisOver.length);
  });

  it('reverts wicket deliveries', async () => {
    const { applyOptimisticDelivery, reverseOptimisticDelivery } = await import('./offline-sync');
    const match = baseMatch();
    const payload = deliveryPayload({
      is_wicket: true,
      wicket_type: 'bowled',
      dismissed_player_id: 'p1',
      runs_batsman: 0,
    });

    const updated = applyOptimisticDelivery(match, payload);
    expect(updated.innings[0].totalWickets).toBe(2);

    const reverted = reverseOptimisticDelivery(updated, payload);
    expect(reverted.innings[0].totalWickets).toBe(1);
    expect(reverted.innings[0].battingScorecard[0].isOut).toBe(false);
  });
});

describe('syncPendingDeliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockUndoLastBall.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('syncs pending rows and marks them synced', async () => {
    const row = {
      id: 1,
      matchId: 'm1',
      payload: JSON.stringify(deliveryPayload()),
      createdAt: '2026-01-01',
      synced: 0,
    };
    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.includes('pending_undos')) return Promise.resolve([]);
      if (sql.includes('pending_deliveries')) return Promise.resolve([row]);
      return Promise.resolve([]);
    });
    mockRecordDelivery.mockResolvedValue({ delivery: { undoStackPos: 1 } });

    const { syncPendingDeliveries } = await import('./offline-sync');
    const result = await syncPendingDeliveries({ matchId: 'm1' });

    expect(result.syncedCount).toBe(1);
    expect(mockRecordDelivery).toHaveBeenCalledWith('m1', expect.objectContaining({ client_id: 'c1' }));
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE pending_deliveries SET synced = 1'),
      [1],
    );
  });

  it('returns conflict info on 409 ApiError', async () => {
    const row = {
      id: 2,
      matchId: 'm1',
      payload: JSON.stringify(deliveryPayload()),
      createdAt: '2026-01-01',
      synced: 0,
    };
    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.includes('pending_undos')) return Promise.resolve([]);
      if (sql.includes('pending_deliveries')) return Promise.resolve([row]);
      return Promise.resolve([]);
    });
    mockRecordDelivery.mockRejectedValue(
      new ApiError('Conflict', 409, 'CONFLICT', {
        server_state: { current_undo_stack_pos: 9 },
      }),
    );
    const onConflict = vi.fn();

    const { syncPendingDeliveries } = await import('./offline-sync');
    const result = await syncPendingDeliveries({ onConflict });

    expect(result.syncedCount).toBe(0);
    expect(result.conflict).toMatchObject({
      message: 'Conflict',
      serverUndoStackPos: 9,
      matchId: 'm1',
    });
    expect(onConflict).toHaveBeenCalledWith(result.conflict);
  });

  it('stops syncing after a non-conflict error', async () => {
    const rows = [
      {
        id: 1,
        matchId: 'm1',
        payload: JSON.stringify(deliveryPayload({ client_id: 'c1' })),
        createdAt: '2026-01-01',
        synced: 0,
      },
      {
        id: 2,
        matchId: 'm1',
        payload: JSON.stringify(deliveryPayload({ client_id: 'c2' })),
        createdAt: '2026-01-01',
        synced: 0,
      },
    ];
    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.includes('pending_undos')) return Promise.resolve([]);
      if (sql.includes('pending_deliveries')) return Promise.resolve(rows);
      return Promise.resolve([]);
    });
    mockRecordDelivery.mockRejectedValue(new Error('network down'));

    const { syncPendingDeliveries } = await import('./offline-sync');
    const result = await syncPendingDeliveries();

    expect(result.syncedCount).toBe(0);
    expect(mockRecordDelivery).toHaveBeenCalledTimes(1);
  });
});

describe('offline-sync alerts and auto-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetNetworkState.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    mockDb.getFirstAsync.mockResolvedValue({ count: 0 });
  });

  afterEach(async () => {
    const { stopAutoSync } = await import('./offline-sync');
    stopAutoSync();
    vi.resetModules();
  });

  it('showSyncConflictAlert calls Alert.alert with default message', async () => {
    const { Alert } = await import('react-native');
    const { showSyncConflictAlert } = await import('./offline-sync');

    showSyncConflictAlert();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Sync conflict',
      expect.stringContaining('updated elsewhere'),
    );
  });

  it('startAutoSync registers a network listener once', async () => {
    const remove = vi.fn();
    mockAddNetworkListener.mockReturnValue({ remove });
    const { startAutoSync } = await import('./offline-sync');

    startAutoSync();
    startAutoSync();

    expect(mockAddNetworkListener).toHaveBeenCalledTimes(1);
  });
});
