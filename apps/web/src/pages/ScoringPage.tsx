import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { joinMatch, leaveMatch, getSocket, WS_EVENTS } from '../lib/socket';
import { offlineStore } from '../lib/offline-store';
import { useScoringStore, type BallDisplay } from '../stores/scoring-store';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

type ExtrasMode = 'normal' | 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty';

const DISMISSAL_TYPES = [
  'bowled', 'caught', 'lbw', 'run_out',
  'stumped', 'hit_wicket', 'caught_and_bowled', 'obstructing',
  'timed_out', 'handled_ball', 'retired_hurt',
] as const;

export function ScoringPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const {
    inningsScore, inningsWickets, inningsOvers, runRate,
    recentBalls, addRecentBall, syncStatus, setSyncStatus,
    updateFromDelivery,
  } = useScoringStore();

  const [extrasMode, setExtrasMode] = useState<ExtrasMode>('normal');
  const [showWicketModal, setShowWicketModal] = useState(false);

  // Fetch match data
  const { data: matchData } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.getMatch(matchId!),
    enabled: !!matchId,
  });

  const currentInnings = matchData?.innings?.find((i: any) => i.status === 'in_progress');

  // WebSocket subscription
  useEffect(() => {
    if (!matchId) return;
    joinMatch(matchId);

    const socket = getSocket();
    const deliveryEvent = WS_EVENTS.delivery(matchId);
    const wicketEvent = WS_EVENTS.wicket(matchId);

    socket.on(deliveryEvent, (data: any) => {
      updateFromDelivery(data);
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    });

    socket.on(wicketEvent, (data: any) => {
      updateFromDelivery(data);
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    });

    return () => {
      leaveMatch(matchId);
      socket.off(deliveryEvent);
      socket.off(wicketEvent);
    };
  }, [matchId]);

  // Record delivery
  const deliveryMutation = useMutation({
    mutationFn: async (input: any) => {
      if (!isOnline) {
        // Queue for offline sync
        await offlineStore.queueDelivery(matchId!, input);
        setSyncStatus('pending', (useScoringStore.getState().pendingCount) + 1);
        return { offline: true };
      }
      return api.recordDelivery(matchId!, input);
    },
    onSuccess: (result) => {
      if (!result.offline) {
        queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      }
      setExtrasMode('normal');
    },
  });

  // Undo
  const undoMutation = useMutation({
    mutationFn: () => api.undoLastBall(matchId!, currentInnings?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
  });

  const recordRuns = useCallback((runs: number) => {
    if (!currentInnings) return;

    const input: any = {
      innings_num: currentInnings.inningsNumber,
      striker_id: 'placeholder-striker',
      non_striker_id: 'placeholder-non-striker',
      bowler_id: 'placeholder-bowler',
      runs_batsman: extrasMode === 'bye' || extrasMode === 'legbye' ? 0 : runs,
      runs_extras: 0,
      extra_type: extrasMode === 'normal' ? null : extrasMode,
      is_wicket: false,
      inningsId: currentInnings.id,
    };

    // Compute extras
    if (extrasMode === 'wide') {
      input.runs_extras = 1 + runs;
      input.runs_batsman = 0;
    } else if (extrasMode === 'noball') {
      input.runs_extras = 1;
    } else if (extrasMode === 'bye') {
      input.runs_extras = runs;
    } else if (extrasMode === 'legbye') {
      input.runs_extras = runs;
    } else if (extrasMode === 'penalty') {
      input.runs_extras = runs;
    }

    input.total_runs = input.runs_batsman + input.runs_extras;

    // Add to recent balls display
    const ball = toBallDisplay(runs, extrasMode, false);
    addRecentBall(ball);

    deliveryMutation.mutate(input);
  }, [currentInnings, extrasMode, deliveryMutation, addRecentBall]);

  const recordWicket = useCallback((wicketType: string) => {
    if (!currentInnings) return;

    const input: any = {
      innings_num: currentInnings.inningsNumber,
      striker_id: 'placeholder-striker',
      non_striker_id: 'placeholder-non-striker',
      bowler_id: 'placeholder-bowler',
      runs_batsman: 0,
      runs_extras: 0,
      extra_type: null,
      is_wicket: true,
      wicket_type: wicketType,
      dismissed_id: 'placeholder-striker',
      inningsId: currentInnings.id,
    };

    addRecentBall({ label: 'W', type: 'wicket' });
    deliveryMutation.mutate(input);
    setShowWicketModal(false);
  }, [currentInnings, deliveryMutation, addRecentBall]);

  // Score display
  const score = currentInnings
    ? `${currentInnings.totalRuns}/${currentInnings.totalWickets}`
    : `${inningsScore}/${inningsWickets}`;
  const overs = currentInnings?.totalOvers || inningsOvers;

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-3">
      {/* Sync status indicator per context.md scorer control panel */}
      {syncStatus !== 'synced' && (
        <div className={`text-xs font-semibold text-center py-1.5 rounded-lg ${
          syncStatus === 'offline' ? 'bg-cricket-red/10 text-cricket-red' : 'bg-cricket-gold/10 text-cricket-gold'
        }`}>
          {syncStatus === 'offline' ? 'Offline mode' : `${useScoringStore.getState().pendingCount} pending sync`}
        </div>
      )}

      {/* Score header */}
      <div className="card text-center py-5">
        <p className="score-display">{score}</p>
        <p className="text-surface-400 text-lg mt-1">({overs} ov)</p>
        {currentInnings?.targetScore && (
          <p className="text-cricket-gold text-sm font-semibold mt-1">
            Target: {currentInnings.targetScore} &middot; Need: {currentInnings.targetScore - (currentInnings.totalRuns || 0)}
          </p>
        )}
        <p className="text-surface-500 text-xs mt-1">CRR: {Number(runRate || 0).toFixed(2)}</p>
      </div>

      {/* Recent balls — this-over tiles */}
      <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none">
        {recentBalls.map((ball, i) => (
          <div
            key={i}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              ball-${ball.type}`}
          >
            {ball.label}
          </div>
        ))}
      </div>

      {/* Extras toggle row */}
      <div className="grid grid-cols-5 gap-1.5">
        {(['normal', 'wide', 'noball', 'bye', 'legbye'] as ExtrasMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setExtrasMode(mode === extrasMode ? 'normal' : mode)}
            className={`py-2.5 rounded-lg text-[11px] font-semibold transition-all ${
              extrasMode === mode
                ? 'bg-cricket-green text-white'
                : 'bg-surface-800 text-surface-400 border border-surface-700'
            }`}
          >
            {mode === 'normal' ? 'Normal' : mode === 'noball' ? 'No Ball' : mode === 'legbye' ? 'Leg Bye' : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Runs grid — 1-tap per context.md section 7.1 */}
      <div className="grid grid-cols-4 gap-2.5">
        {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
          <button
            key={runs}
            onClick={() => recordRuns(runs)}
            disabled={deliveryMutation.isPending}
            className={`aspect-square rounded-2xl flex flex-col items-center justify-center
              text-2xl font-extrabold transition-all active:scale-95 disabled:opacity-50
              ${runs === 4 ? 'bg-cricket-green/10 text-cricket-green border-2 border-cricket-green/30' :
                runs === 6 ? 'bg-purple-600/10 text-purple-400 border-2 border-purple-500/30' :
                runs === 0 ? 'bg-surface-800 text-surface-500 border border-surface-700' :
                'bg-surface-800 text-surface-100 border border-surface-700 hover:border-surface-500'
              }`}
          >
            {runs}
            {runs === 4 && <span className="text-[9px] font-bold mt-[-2px]">FOUR</span>}
            {runs === 6 && <span className="text-[9px] font-bold mt-[-2px]">SIX</span>}
          </button>
        ))}

        {/* Wicket button in the grid */}
        <button
          onClick={() => setShowWicketModal(true)}
          className="aspect-square rounded-2xl flex flex-col items-center justify-center
            bg-cricket-red/10 text-cricket-red border-2 border-cricket-red/30
            text-lg font-extrabold active:scale-95"
        >
          W
          <span className="text-[9px] font-bold mt-[-2px]">WICKET</span>
        </button>
      </div>

      {/* Undo + actions row */}
      <div className="flex gap-2">
        <button
          onClick={() => undoMutation.mutate()}
          disabled={undoMutation.isPending}
          className="btn-outline flex-1 text-cricket-gold text-sm"
        >
          Undo Last Ball
        </button>
      </div>

      {/* Wicket modal */}
      {showWicketModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end tablet:items-center justify-center p-4">
          <div className="card w-full max-w-md animate-in">
            <h3 className="text-lg font-bold mb-4 text-center">Dismissal Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {DISMISSAL_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => recordWicket(type)}
                  className="bg-surface-700 hover:bg-surface-600 text-surface-200 py-3.5 rounded-lg
                    text-xs font-semibold uppercase tracking-wide transition-colors"
                >
                  {type.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowWicketModal(false)}
              className="btn-outline w-full mt-4 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function toBallDisplay(runs: number, extras: ExtrasMode, isWicket: boolean): BallDisplay {
  if (isWicket) return { label: 'W', type: 'wicket' };
  if (extras === 'wide') return { label: `Wd${runs > 0 ? '+' + runs : ''}`, type: 'wide' };
  if (extras === 'noball') return { label: `Nb${runs > 0 ? '+' + runs : ''}`, type: 'noball' };
  if (extras === 'bye') return { label: `B${runs}`, type: 'bye' };
  if (extras === 'legbye') return { label: `Lb${runs}`, type: 'legbye' };
  if (runs === 0) return { label: '0', type: 'dot' };
  if (runs === 4) return { label: '4', type: 'four' };
  if (runs === 6) return { label: '6', type: 'six' };
  return { label: String(runs), type: 'run' };
}
