import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Undo2, X, ChevronLeft, AlertTriangle, Trophy, ArrowLeft, ArrowLeftRight, ChevronDown, TrendingUp, BarChart3 } from 'lucide-react';
import type { PredictionEvent, Commentary } from '@cricket/shared';
import { api, ApiError } from '../lib/api';
import { joinMatch, leaveMatch, getSocket, WS_EVENTS } from '../lib/socket';
import { offlineStore } from '../lib/offline-store';
import { useScoringStore, type BallDisplay } from '../stores/scoring-store';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { TossWizard } from '../components/TossWizard';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { CommentaryEditor } from '../components/CommentaryEditor';
import { MatchChat } from '../components/MatchChat';

type ExtrasMode = 'normal' | 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty';

const DISMISSAL_TYPES = [
  'bowled', 'caught', 'lbw', 'run_out',
  'stumped', 'hit_wicket', 'caught_and_bowled', 'obstructing',
  'timed_out', 'handled_ball', 'retired_hurt',
] as const;

const EXTRAS_CONFIG: { mode: ExtrasMode; label: string; activeClass: string }[] = [
  { mode: 'wide', label: 'Wide', activeClass: 'bg-cricket-gold/20 text-cricket-gold border-cricket-gold/40' },
  { mode: 'noball', label: 'No Ball', activeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  { mode: 'bye', label: 'Bye', activeClass: 'bg-cricket-blue/20 text-cricket-blue border-cricket-blue/40' },
  { mode: 'legbye', label: 'Leg Bye', activeClass: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
];

// ─── Animation variants ──────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } },
};

const ballBubbleVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 500, damping: 25, delay: i * 0.03 },
  }),
};

const dismissalButtonVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 25, delay: i * 0.02 },
  }),
};

const noMotion = {
  initial: undefined,
  animate: undefined,
  exit: undefined,
  whileTap: undefined,
  transition: undefined,
};

// ─── Undo Toast Component ────────────────────────────────────────────────────

interface UndoToastProps {
  message: string;
  visible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  reduceMotion: boolean;
}

function UndoToast({ message, visible, onUndo, onDismiss, reduceMotion }: UndoToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-20 left-1/2 z-40 max-w-sm w-[calc(100%-2rem)]"
          style={{ x: '-50%' }}
          initial={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className="glass px-4 py-3 flex items-center justify-between gap-3 rounded-xl shadow-lg">
            <span className="text-sm text-theme-secondary truncate">{message}</span>
            <button
              onClick={onUndo}
              className="text-cricket-gold text-sm font-bold shrink-0 min-w-0 min-h-0 px-2 py-1 flex items-center gap-1"
              aria-label="Undo last delivery"
            >
              <Undo2 size={14} />
              Undo
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main Scoring Page ───────────────────────────────────────────────────────

export function ScoringPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;

  const {
    inningsScore, inningsWickets, inningsOvers, runRate,
    requiredRunRate,
    recentBalls, addRecentBall, syncStatus, setSyncStatus,
    updateFromDelivery,
  } = useScoringStore();

  const [extrasMode, setExtrasMode] = useState<ExtrasMode>('normal');
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [wicketDismissalType, setWicketDismissalType] = useState<string | null>(null);
  const [wicketRunOutRuns, setWicketRunOutRuns] = useState(0);
  const [runOutDismissedId, setRunOutDismissedId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [wicketShake, setWicketShake] = useState(false);
  const [milestoneToast, setMilestoneToast] = useState<{ text: string; type: string } | null>(null);

  // Track current on-strike players (updated from API response after each delivery)
  const [currentStrikerId, setCurrentStrikerId] = useState<string | null>(null);
  const [currentNonStrikerId, setCurrentNonStrikerId] = useState<string | null>(null);
  const [currentBowlerId, setCurrentBowlerId] = useState<string | null>(null);
  const [showBowlerSelect, setShowBowlerSelect] = useState(false);
  const [pendingBowlerChange, setPendingBowlerChange] = useState(false);
  const [lastOverBowlerId, setLastOverBowlerId] = useState<string | null>(null);
  const [isFreeHit, setIsFreeHit] = useState(false);
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [dismissedPlayerId, setDismissedPlayerId] = useState<string | null>(null);

  // Innings/match completion state
  const [inningsCompleted, setInningsCompleted] = useState(false);
  const [matchCompleted, setMatchCompleted] = useState(false);
  const [completionInfo, setCompletionInfo] = useState<{
    teamName: string; score: number; wickets: number; overs: string; resultSummary?: string;
  } | null>(null);

  // Win prediction (2nd innings chase)
  const [prediction, setPrediction] = useState<PredictionEvent | null>(null);

  // Commentary editor state — tracks latest commentary for the most recent delivery
  const [latestCommentary, setLatestCommentary] = useState<Commentary | null>(null);
  const [deliveryVersion, setDeliveryVersion] = useState(0);

  // Manual strike swap
  const swapStrike = useCallback(() => {
    setCurrentStrikerId(prev => {
      const oldStriker = prev;
      setCurrentNonStrikerId(oldStriker);
      return currentNonStrikerId;
    });
  }, [currentNonStrikerId]);

  // Select a specific batsman as striker (tap to select)
  const selectStriker = useCallback((playerId: string) => {
    if (playerId === currentStrikerId) return; // already striker
    setCurrentNonStrikerId(currentStrikerId);
    setCurrentStrikerId(playerId);
  }, [currentStrikerId]);

  // Change bowler
  const changeBowler = useCallback((bowlerId: string) => {
    // Prevent selecting the same bowler who bowled the previous over
    if (pendingBowlerChange && bowlerId === lastOverBowlerId) {
      return; // ignore — can't bowl consecutive overs
    }
    setCurrentBowlerId(bowlerId);
    setShowBowlerSelect(false);
    setPendingBowlerChange(false);
  }, [pendingBowlerChange, lastOverBowlerId]);

  const wicketModalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Fetch match data
  const { data: matchData, isLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.getMatch(matchId!),
    enabled: !!matchId,
  });

  const currentInnings = matchData?.innings?.find((i: any) => i.status === 'in_progress');
  const completedInnings = matchData?.innings?.find((i: any) => i.status === 'completed');
  const needsStart = matchData && !currentInnings && matchData.status !== 'completed';

  // Check if innings/match is already completed on mount or data refresh
  useEffect(() => {
    if (!matchData) return;
    if (matchData.status === 'completed') {
      setMatchCompleted(true);
      setInningsCompleted(true);
      const lastInnings = matchData.innings?.[matchData.innings.length - 1] as any;
      setCompletionInfo({
        teamName: matchData.teams?.find((t: any) => t.teamId === lastInnings?.battingTeamId)?.teamName || 'Team',
        score: lastInnings?.totalRuns ?? 0,
        wickets: lastInnings?.totalWickets ?? 0,
        overs: lastInnings?.totalOvers ?? '0.0',
        resultSummary: matchData.resultSummary || undefined,
      });
    } else if (!currentInnings && completedInnings) {
      // Innings completed but match not over — waiting for next innings
      setInningsCompleted(true);
      setMatchCompleted(false);
      setCompletionInfo({
        teamName: matchData.teams?.find((t: any) => t.teamId === completedInnings?.battingTeamId)?.teamName || 'Team',
        score: (completedInnings as any)?.totalRuns ?? 0,
        wickets: (completedInnings as any)?.totalWickets ?? 0,
        overs: (completedInnings as any)?.totalOvers ?? '0.0',
      });
    }
  }, [matchData?.status, currentInnings?.id, completedInnings?.id]);

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
      // Capture commentary for the CommentaryEditor
      if (data?.commentary) {
        setLatestCommentary(data.commentary);
        setDeliveryVersion((v) => v + 1);
      }
    });

    socket.on(wicketEvent, (data: any) => {
      updateFromDelivery(data);
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    });

    const overEvent = WS_EVENTS.over(matchId);
    socket.on(overEvent, () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    });

    const milestoneEvent = WS_EVENTS.milestone(matchId);
    socket.on(milestoneEvent, (data: { text: string; type: string }) => {
      setMilestoneToast({ text: data.text, type: data.type });
      setTimeout(() => setMilestoneToast(null), 5000);
    });

    const predictionEvent = WS_EVENTS.prediction(matchId);
    socket.on(predictionEvent, (data: PredictionEvent) => {
      setPrediction(data);
    });

    return () => {
      leaveMatch(matchId);
      socket.off(deliveryEvent);
      socket.off(wicketEvent);
      socket.off(overEvent);
      socket.off(milestoneEvent);
      socket.off(predictionEvent);
    };
  }, [matchId]);

  // Offline reconnection: replay queued deliveries when coming back online
  useEffect(() => {
    if (!matchId) return;

    const replayPendingDeliveries = async () => {
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
        } catch (err) {
          await offlineStore.markFailed(entry.id);
        }
      }

      // Refresh match state after replaying all queued deliveries
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      const remaining = await offlineStore.getPendingDeliveries();
      const matchRemaining = remaining.filter((d) => d.matchId === matchId);
      if (matchRemaining.length === 0) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('pending', matchRemaining.length);
      }
    };

    const handleOnline = () => {
      replayPendingDeliveries();
    };

    window.addEventListener('online', handleOnline);

    // Also replay on mount if already online and there might be pending items
    if (navigator.onLine) {
      replayPendingDeliveries();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [matchId, queryClient, setSyncStatus]);

  // Record delivery
  const deliveryMutation = useMutation({
    mutationFn: async (input: any) => {
      if (!isOnline) {
        await offlineStore.queueDelivery(matchId!, input);
        setSyncStatus('pending', (useScoringStore.getState().pendingCount) + 1);
        return { offline: true };
      }
      return api.recordDelivery(matchId!, input);
    },
    onSuccess: (result: any) => {
      if (!('offline' in result)) {
        queryClient.invalidateQueries({ queryKey: ['match', matchId] });

        // Capture commentary from delivery response for the editor
        if (result.commentary) {
          setLatestCommentary(result.commentary);
          setDeliveryVersion((v) => v + 1);
        }

        // Update strike from server response (cricket rotation rules applied server-side)
        if (result.newStrikerId) setCurrentStrikerId(result.newStrikerId);
        if (result.newNonStrikerId) setCurrentNonStrikerId(result.newNonStrikerId);

        // Free-hit: next ball is free hit if this was a no-ball
        setIsFreeHit(result.delivery?.extraType === 'noball');

        // New batsman needed after wicket
        if (result.newStrikerId === 'PENDING_NEW_BATSMAN' || result.newNonStrikerId === 'PENDING_NEW_BATSMAN') {
          setDismissedPlayerId(result.delivery?.dismissedId || null);
          setShowNewBatsmanModal(true);
        }

        // Clear "This Over" display when over completes
        if (result.overCompleted) {
          useScoringStore.getState().clearRecentBalls();
          // Force bowler change — same bowler can't bowl consecutive overs
          setLastOverBowlerId(currentBowlerId);
          setShowBowlerSelect(true);
          setPendingBowlerChange(true);
        }

        // Innings / match completion
        if (result.inningsCompleted) {
          setInningsCompleted(true);
          setCompletionInfo({
            teamName: battingTeam?.teamName || 'Batting Team',
            score: result.scorecardSnapshot?.innings_score ?? currentInnings?.totalRuns ?? 0,
            wickets: result.scorecardSnapshot?.innings_wickets ?? currentInnings?.totalWickets ?? 0,
            overs: result.scorecardSnapshot?.innings_overs ?? currentInnings?.totalOvers ?? '0.0',
          });
        }
        if (result.matchCompleted) {
          setMatchCompleted(true);
          setInningsCompleted(true);
          setCompletionInfo({
            teamName: battingTeam?.teamName || 'Batting Team',
            score: result.scorecardSnapshot?.innings_score ?? currentInnings?.totalRuns ?? 0,
            wickets: result.scorecardSnapshot?.innings_wickets ?? currentInnings?.totalWickets ?? 0,
            overs: result.scorecardSnapshot?.innings_overs ?? currentInnings?.totalOvers ?? '0.0',
            resultSummary: matchData?.resultSummary || undefined,
          });
        }
      }
      setExtrasMode('normal');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // Sync conflict: another scorer updated the match state
        setToastMessage('Score was updated by another scorer. Refreshing...');
        setToastVisible(true);
        queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        return;
      }
      setToastMessage(`Error: ${(error as Error).message}`);
      setToastVisible(true);
    },
  });

  // Undo
  const undoMutation = useMutation({
    mutationFn: () => api.undoLastBall(matchId!, currentInnings?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      setToastVisible(false);
    },
  });

  // Get player IDs from match teams
  const battingTeam = matchData?.teams?.find((t: any) => t.teamId === currentInnings?.battingTeamId);
  const bowlingTeam = matchData?.teams?.find((t: any) => t.teamId === currentInnings?.bowlingTeamId);
  const battingXi = battingTeam?.playingXi || [];
  const bowlingXi = bowlingTeam?.playingXi || [];

  // Unified player name lookup: team playerNames map → scorecard playerName → fallback
  const battingPlayerNames: Record<string, string> = battingTeam?.playerNames || {};
  const bowlingPlayerNames: Record<string, string> = bowlingTeam?.playerNames || {};
  const allPlayerNames: Record<string, string> = { ...battingPlayerNames, ...bowlingPlayerNames };

  // Extract scorecard data (API response includes enriched fields beyond the static Innings type)
  const inningsData = currentInnings as any;
  const battingScorecard: any[] = inningsData?.battingScorecard || [];
  const bowlingScorecard: any[] = inningsData?.bowlingScorecard || [];

  // Active batsmen: those who have faced balls and are not out, or the first two in XI
  const activeBatsmen = battingScorecard
    .filter((b: any) => !b.isOut && !b.didNotBat && b.ballsFaced > 0)
    .sort((a: any, b: any) => (b.ballsFaced || 0) - (a.ballsFaced || 0));

  // If no one has batted yet, use first two from batting XI scorecard who haven't been dismissed
  const notOutBatsmen = activeBatsmen.length > 0
    ? activeBatsmen
    : battingScorecard.filter((b: any) => !b.isOut && !b.didNotBat).slice(0, 2);

  // Initialize tracked IDs from scorecard data when match first loads
  useEffect(() => {
    if (!currentInnings) return;

    // Set striker/non-striker from scorecard if not already tracked
    if (!currentStrikerId && notOutBatsmen.length > 0) {
      setCurrentStrikerId(notOutBatsmen[0]?.playerId || battingXi[0] || null);
    }
    if (!currentNonStrikerId && notOutBatsmen.length > 1) {
      setCurrentNonStrikerId(notOutBatsmen[1]?.playerId || battingXi[1] || null);
    }
    if (!currentBowlerId) {
      // Find the bowler who has bowled most recently
      const activeBowler = bowlingScorecard
        .filter((b: any) => parseFloat(b.oversBowled) > 0 || b.runsConceded > 0)
        .sort((a: any, b: any) => parseFloat(b.oversBowled || '0') - parseFloat(a.oversBowled || '0'))[0];
      setCurrentBowlerId(activeBowler?.playerId || bowlingXi[0] || null);
    }
  }, [currentInnings?.id, notOutBatsmen.length, bowlingScorecard.length]);

  // Find scorecard entries for the currently tracked striker/non-striker
  const striker = battingScorecard.find((b: any) => b.playerId === currentStrikerId) || notOutBatsmen[0] || null;
  const nonStriker = battingScorecard.find((b: any) => b.playerId === currentNonStrikerId) || notOutBatsmen[1] || null;

  const getPlayerName = (entry: any, fallback: string) => {
    if (!entry) return fallback;
    // Check scorecard enriched name first, then team playerNames map
    return entry.playerName || entry.player_name || allPlayerNames[entry.playerId] || fallback;
  };

  const getBatStats = (entry: any) => ({
    runs: entry?.runs ?? entry?.runsScored ?? 0,
    balls: entry?.balls ?? entry?.ballsFaced ?? 0,
    fours: entry?.fours ?? 0,
    sixes: entry?.sixes ?? 0,
  });

  const calcSR = (runs: number, balls: number) =>
    balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';

  // Current bowler: prefer the tracked bowler ID, otherwise the most recent active bowler
  const activeBowlers = bowlingScorecard
    .filter((b: any) => parseFloat(b.oversBowled) > 0 || b.runsConceded > 0)
    .sort((a: any, b: any) => parseFloat(b.oversBowled || '0') - parseFloat(a.oversBowled || '0'));
  const trackedBowler = currentBowlerId
    ? bowlingScorecard.find((b: any) => b.playerId === currentBowlerId)
    : null;
  const currentBowler = trackedBowler || activeBowlers[0] || null;
  // Build a display name for the bowler — may not have a scorecard entry yet
  const currentBowlerName = currentBowler
    ? getPlayerName(currentBowler, allPlayerNames[currentBowlerId || ''] || 'Bowler')
    : allPlayerNames[currentBowlerId || ''] || 'Bowler';

  const getBowlStats = (entry: any) => ({
    overs: entry?.overs ?? entry?.oversBowled ?? '0.0',
    maidens: entry?.maidens ?? 0,
    runs: entry?.runsConceded ?? entry?.runs ?? 0,
    wickets: entry?.wickets ?? 0,
  });

  const calcEcon = (runs: number, overs: string | number) => {
    const o = typeof overs === 'string' ? parseFloat(overs) : overs;
    if (!o || o === 0) return '0.00';
    const completedOvers = Math.floor(o);
    const partialBalls = Math.round((o - completedOvers) * 10);
    const totalBalls = completedOvers * 6 + partialBalls;
    return totalBalls > 0 ? ((runs / totalBalls) * 6).toFixed(2) : '0.00';
  };

  // This Over: derive from recentBalls — show only balls from the current partial over
  const oversStr = currentInnings?.totalOvers || inningsOvers || '0.0';
  const oversParts = String(oversStr).split('.');
  const ballsInCurrentOver = parseInt(oversParts[1] || '0', 10);
  // When ballsInCurrentOver is 0 (over just completed / new over starting), show empty
  // slice(-0) would return ALL elements — that's the bug we're fixing
  const thisOverBalls = ballsInCurrentOver > 0 ? recentBalls.slice(-ballsInCurrentOver) : [];
  const thisOverRuns = thisOverBalls.reduce((sum, b) => {
    const n = parseInt(b.label.replace(/[^\d]/g, ''), 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  // Partnership: from match data if available
  const partnershipRuns = inningsData?.currentPartnership?.runs
    ?? inningsData?.partnership?.runs ?? null;
  const partnershipBalls = inningsData?.currentPartnership?.balls
    ?? inningsData?.partnership?.balls ?? null;

  // Required Run Rate
  const rrr = inningsData?.requiredRunRate ?? requiredRunRate ?? null;
  const isChasing = !!(currentInnings?.targetScore);

  // Score display data
  const score = currentInnings
    ? `${currentInnings.totalRuns ?? 0}/${currentInnings.totalWickets ?? 0}`
    : `${inningsScore}/${inningsWickets}`;

  const buildDeliveryDescription = (runs: number, extras: ExtrasMode, isWicket: boolean): string => {
    if (isWicket) return 'Wicket!';
    const parts: string[] = [];
    if (extras !== 'normal') {
      const names: Record<ExtrasMode, string> = {
        normal: '', wide: 'Wide', noball: 'No Ball', bye: 'Bye', legbye: 'Leg Bye', penalty: 'Penalty',
      };
      parts.push(names[extras]);
    }
    if (runs === 0 && extras === 'normal') return 'Dot ball';
    if (runs > 0) parts.push(`${runs} run${runs > 1 ? 's' : ''}`);
    return parts.join(' + ') || 'Delivery recorded';
  };

  const recordRuns = useCallback((runs: number) => {
    if (!currentInnings) return;

    const input: any = {
      client_id: crypto.randomUUID(),
      innings_num: currentInnings.inningsNumber,
      striker_id: currentStrikerId || battingXi[0] || 'unknown',
      non_striker_id: currentNonStrikerId || battingXi[1] || 'unknown',
      bowler_id: currentBowlerId || bowlingXi[0] || 'unknown',
      runs_batsman: extrasMode === 'bye' || extrasMode === 'legbye' ? 0 : runs,
      runs_extras: 0,
      extra_type: extrasMode === 'normal' ? null : extrasMode,
      is_wicket: false,
      inningsId: currentInnings.id,
    };

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

    const ball = toBallDisplay(runs, extrasMode, false);
    addRecentBall(ball);
    deliveryMutation.mutate(input);

    // Show undo toast
    const desc = buildDeliveryDescription(runs, extrasMode, false);
    setToastMessage(desc);
    setToastVisible(true);
  }, [currentInnings, extrasMode, deliveryMutation, addRecentBall, battingXi, bowlingXi, currentStrikerId, currentNonStrikerId, currentBowlerId]);

  const recordWicket = useCallback((wicketType: string, runsOnWicket = 0, dismissedId?: string) => {
    if (!currentInnings) return;

    // For run-out, the dismissed player can be either striker or non-striker
    // For all other dismissals, it's always the striker
    const resolvedDismissedId = dismissedId
      || currentStrikerId || battingXi[0] || 'unknown';

    const input: any = {
      client_id: crypto.randomUUID(),
      innings_num: currentInnings.inningsNumber,
      striker_id: currentStrikerId || battingXi[0] || 'unknown',
      non_striker_id: currentNonStrikerId || battingXi[1] || 'unknown',
      bowler_id: currentBowlerId || bowlingXi[0] || 'unknown',
      runs_batsman: wicketType === 'run_out' ? runsOnWicket : 0,
      runs_extras: 0,
      extra_type: null,
      is_wicket: true,
      wicket_type: wicketType,
      dismissed_player_id: resolvedDismissedId,
      inningsId: currentInnings.id,
    };

    if (wicketType === 'run_out' && runsOnWicket > 0) {
      input.total_runs = runsOnWicket;
    } else {
      input.total_runs = 0;
    }

    addRecentBall({ label: 'W', type: 'wicket' });
    deliveryMutation.mutate(input);
    setShowWicketModal(false);
    setWicketDismissalType(null);
    setWicketRunOutRuns(0);
    setRunOutDismissedId(null);

    // Trigger shake on wicket button
    setWicketShake(true);
    setTimeout(() => setWicketShake(false), 500);

    setToastMessage('Wicket!');
    setToastVisible(true);
  }, [currentInnings, deliveryMutation, addRecentBall, battingXi, bowlingXi, currentStrikerId, currentNonStrikerId, currentBowlerId]);

  // Wicket modal: close on Escape + focus trap
  useEffect(() => {
    if (!showWicketModal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowWicketModal(false);
        setWicketDismissalType(null);
      }
      if (e.key === 'Tab' && wicketModalRef.current) {
        const focusable = wicketModalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => firstFocusableRef.current?.focus());
    return () => document.removeEventListener('keydown', handleKey);
  }, [showWicketModal]);

  // ─── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto flex flex-col gap-4 animate-pulse">
        <div className="card text-center py-8">
          <div className="h-14 skeleton-strong rounded-xl w-1/3 mx-auto mb-3" />
          <div className="h-5 skeleton-subtle rounded-lg w-1/4 mx-auto" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1 h-24 skeleton-subtle rounded-2xl" />
          <div className="flex-1 h-24 skeleton-subtle rounded-2xl" />
        </div>
        <div className="h-16 skeleton-subtle rounded-2xl" />
        <div className="grid grid-cols-4 gap-2.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-2xl skeleton-subtle" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Match needs to be started — show Toss Wizard ─────────────────────────
  if (needsStart) {
    return <TossWizard matchId={matchId!} matchData={matchData!} />;
  }

  // ─── Score display data ───────────────────────────────────────────────────
  const overs = currentInnings?.totalOvers || inningsOvers;
  // Calculate run rate from overs (e.g., "3.2" = 3 overs + 2 balls = 20 balls)
  const computedRunRate = (() => {
    const totalRuns = currentInnings?.totalRuns ?? inningsScore ?? 0;
    const oversStr = currentInnings?.totalOvers || inningsOvers || '0.0';
    const oversNum = parseFloat(String(oversStr));
    const completedOvers = Math.floor(oversNum);
    const partialBalls = Math.round((oversNum - completedOvers) * 10);
    const totalBalls = completedOvers * 6 + partialBalls;
    if (totalBalls === 0) return '0.00';
    return ((totalRuns / totalBalls) * 6).toFixed(2);
  })();

  const strikerStats = getBatStats(striker);
  const nonStrikerStats = getBatStats(nonStriker);
  const bowlerStats = currentBowler ? getBowlStats(currentBowler) : null;

  // All scoring controls disabled when innings or match is completed
  const scoringDisabled = inningsCompleted || matchCompleted;

  return (
    <motion.div
      className="max-w-lg mx-auto flex flex-col gap-3 pb-24"
      variants={reduceMotion ? undefined : containerVariants}
      initial={reduceMotion ? undefined : 'hidden'}
      animate={reduceMotion ? undefined : 'visible'}
    >
      {/* ── Back button + Sync Status ──────────────────────────────── */}
      <motion.div variants={reduceMotion ? undefined : itemVariants} className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors min-h-0 min-w-0 py-1">
          <ArrowLeft size={16} />
          <span>Back to Matches</span>
        </Link>
        <SyncStatusBadge />
      </motion.div>

      {/* ── Sync status ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {syncStatus !== 'synced' && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="overflow-hidden"
          >
            <div className={`flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-xl ${
              syncStatus === 'offline'
                ? 'bg-cricket-red/10 text-cricket-red border border-cricket-red/20'
                : 'bg-cricket-gold/10 text-cricket-gold border border-cricket-gold/20'
            }`}>
              <AlertTriangle size={12} className="animate-pulse-soft" />
              {syncStatus === 'offline' ? 'Offline mode' : `${useScoringStore.getState().pendingCount} pending`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Score header ────────────────────────────────────────────── */}
      <motion.div
        className="card pitch-texture text-center py-6 relative overflow-hidden"
        aria-live="polite"
        variants={reduceMotion ? undefined : itemVariants}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-cricket-green/[0.04] via-transparent to-cricket-green/[0.02] pointer-events-none" />
        <div className="relative">
          <p className="text-xs font-bold text-theme-tertiary uppercase tracking-widest mb-2">
            {battingTeam?.teamName || 'Batting'}
          </p>
          <div className="score-display" style={{ willChange: 'transform' }}>
            <AnimatePresence mode="wait">
              <motion.span
                key={score}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.8 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="inline-block"
              >
                {score}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="text-theme-tertiary text-lg mt-2 font-medium tabular-nums">({overs} ov)</p>
          {currentInnings?.targetScore && (
            <p className="text-cricket-gold text-sm font-semibold mt-2 flex items-center justify-center gap-2">
              <Trophy size={14} className="opacity-70" />
              <span>Target: {currentInnings.targetScore}</span>
              <span className="text-theme-muted">|</span>
              <span>Need: {currentInnings.targetScore - (currentInnings.totalRuns || 0)}</span>
            </p>
          )}
          <div className="flex items-center justify-center gap-4 mt-3">
            <span className="text-theme-tertiary text-xs font-medium">
              CRR{' '}
              <span className="text-theme-secondary font-semibold tabular-nums">{computedRunRate}</span>
            </span>
            {isChasing && rrr !== null && (
              <span className="text-theme-tertiary text-xs font-medium">
                RRR{' '}
                <span className="text-cricket-gold font-semibold tabular-nums">
                  {Number(rrr).toFixed(2)}
                </span>
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Batsmen panel ───────────────────────────────────────────── */}
      <motion.div
        className="relative"
        variants={reduceMotion ? undefined : itemVariants}
      >
        <div className="grid grid-cols-2 gap-2">
          {/* Striker — tap to keep on strike (no-op if already striker) */}
          <motion.button
            className="card p-3 border-l-2 border-l-cricket-green text-left min-h-0"
            onClick={() => striker?.playerId && selectStriker(striker.playerId)}
            initial={reduceMotion ? undefined : { opacity: 0, x: -10 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ willChange: 'transform' }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="striker-dot" />
              <span className="text-[10px] font-bold text-cricket-green uppercase tracking-widest">Striker</span>
            </div>
            <p className="text-sm font-bold text-theme-primary truncate mb-1.5">
              {getPlayerName(striker, 'Batsman 1')}
            </p>
            <p className="text-lg font-extrabold text-theme-primary tabular-nums leading-none">
              {strikerStats.runs}
              <span className="text-xs text-theme-tertiary font-medium ml-1">({strikerStats.balls})</span>
            </p>
            <div className="flex gap-2.5 mt-2 text-[10px] text-theme-muted font-medium tabular-nums">
              <span>4s: <span className="text-cricket-green">{strikerStats.fours}</span></span>
              <span>6s: <span className="text-cricket-purple">{strikerStats.sixes}</span></span>
              <span>SR: <span className="text-theme-secondary">{calcSR(strikerStats.runs, strikerStats.balls)}</span></span>
            </div>
          </motion.button>

          {/* Non-Striker — tap to promote to striker */}
          <motion.button
            className="card p-3 text-left min-h-0"
            onClick={() => nonStriker?.playerId && selectStriker(nonStriker.playerId)}
            initial={reduceMotion ? undefined : { opacity: 0, x: 10 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ willChange: 'transform' }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest">Non-Striker</span>
            </div>
            <p className="text-sm font-bold text-theme-primary truncate mb-1.5">
              {getPlayerName(nonStriker, 'Batsman 2')}
            </p>
            <p className="text-lg font-extrabold text-theme-primary tabular-nums leading-none">
              {nonStrikerStats.runs}
              <span className="text-xs text-theme-tertiary font-medium ml-1">({nonStrikerStats.balls})</span>
            </p>
            <div className="flex gap-2.5 mt-2 text-[10px] text-theme-muted font-medium tabular-nums">
              <span>4s: <span className="text-cricket-green">{nonStrikerStats.fours}</span></span>
              <span>6s: <span className="text-cricket-purple">{nonStrikerStats.sixes}</span></span>
              <span>SR: <span className="text-theme-secondary">{calcSR(nonStrikerStats.runs, nonStrikerStats.balls)}</span></span>
            </div>
          </motion.button>
        </div>

        {/* Swap strike button — centered between the two panels */}
        <motion.button
          onClick={swapStrike}
          whileTap={reduceMotion ? undefined : { scale: 0.85, rotate: 180 }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10
            w-8 h-8 min-w-0 min-h-0 rounded-full
            bg-[var(--bg-card)] border border-[var(--border-medium)] shadow-sm
            flex items-center justify-center text-theme-tertiary hover:text-cricket-green
            hover:border-cricket-green/40 transition-colors"
          aria-label="Swap striker and non-striker"
          title="Swap strike"
        >
          <ArrowLeftRight size={12} />
        </motion.button>
      </motion.div>

      {/* ── Bowler panel ────────────────────────────────────────────── */}
      <motion.div
        className="card p-3 relative"
        variants={reduceMotion ? undefined : itemVariants}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest">Bowler</span>
            <p className="text-sm font-bold text-theme-primary mt-0.5">
              {currentBowlerName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {bowlerStats && (
              <div className="flex gap-3 text-xs font-semibold text-theme-secondary tabular-nums">
                <span>{bowlerStats.overs}-{bowlerStats.maidens}-{bowlerStats.runs}-{bowlerStats.wickets}</span>
                <span className="text-theme-tertiary">
                  Econ <span className="text-theme-secondary">{calcEcon(bowlerStats.runs, bowlerStats.overs)}</span>
                </span>
              </div>
            )}
            <motion.button
              onClick={() => setShowBowlerSelect(!showBowlerSelect)}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="w-7 h-7 min-w-0 min-h-0 rounded-lg flex items-center justify-center
                text-theme-tertiary hover:text-theme-primary hover:bg-[var(--bg-hover)] transition-colors"
              aria-label="Change bowler"
              title="Change bowler"
            >
              <ChevronDown size={14} className={`transition-transform duration-200 ${showBowlerSelect ? 'rotate-180' : ''}`} />
            </motion.button>
          </div>
        </div>

        {/* Bowler selection dropdown */}
        <AnimatePresence>
          {showBowlerSelect && (
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                <p className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest mb-2">
                  {pendingBowlerChange ? 'Select New Bowler (over change)' : 'Select Bowler'}
                </p>
                {pendingBowlerChange && (
                  <p className="text-[10px] text-cricket-gold mb-2">Same bowler cannot bowl consecutive overs</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {bowlingXi.map((playerId: string) => {
                    const bowlerEntry = bowlingScorecard.find((b: any) => b.playerId === playerId);
                    const name = bowlerEntry?.playerName || allPlayerNames[playerId] || 'Bowler';
                    const isActive = playerId === currentBowlerId;
                    const isDisabled = pendingBowlerChange && playerId === lastOverBowlerId;
                    return (
                      <motion.button
                        key={playerId}
                        onClick={() => !isDisabled && changeBowler(playerId)}
                        whileTap={reduceMotion || isDisabled ? undefined : { scale: 0.95 }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                          isDisabled
                            ? 'opacity-30 cursor-not-allowed surface-muted line-through'
                            : isActive
                            ? 'bg-cricket-green/15 text-cricket-green border border-cricket-green/30'
                            : 'surface-interactive'
                        }`}
                        aria-disabled={isDisabled}
                      >
                        {name}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── This Over ───────────────────────────────────────────────── */}
      <motion.div
        className="card p-3"
        variants={reduceMotion ? undefined : itemVariants}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest">
            This Over {thisOverBalls.length > 0 && `(${thisOverBalls.length})`}
          </span>
          <span className="text-xs font-semibold text-theme-secondary tabular-nums">{thisOverRuns} runs</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {thisOverBalls.length > 0 ? (
            thisOverBalls.map((ball, i) => (
              <motion.div
                key={i}
                custom={i}
                variants={reduceMotion ? undefined : ballBubbleVariants}
                initial={reduceMotion ? undefined : 'hidden'}
                animate={reduceMotion ? undefined : 'visible'}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ball-${ball.type}`}
                style={{ willChange: 'transform' }}
              >
                {ball.label}
              </motion.div>
            ))
          ) : (
            <span className="text-xs text-theme-muted">No balls yet</span>
          )}
        </div>
      </motion.div>

      {/* ── Commentary Editor (last delivery) ─────────────────────── */}
      {latestCommentary && (
        <motion.div variants={reduceMotion ? undefined : itemVariants}>
          <CommentaryEditor
            matchId={matchId!}
            commentary={latestCommentary}
            deliveryVersion={deliveryVersion}
          />
        </motion.div>
      )}

      {/* ── Partnership ─────────────────────────────────────────────── */}
      {partnershipRuns !== null && partnershipBalls !== null && (
        <motion.div
          className="text-center text-xs text-theme-muted font-medium"
          variants={reduceMotion ? undefined : itemVariants}
        >
          Partnership: <span className="text-theme-secondary font-semibold tabular-nums">{partnershipRuns}</span>
          <span className="text-theme-tertiary"> ({partnershipBalls})</span>
        </motion.div>
      )}

      {/* ── Free Hit banner ────────────────────────────────────────── */}
      <AnimatePresence>
        {isFreeHit && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-cricket-green/10 border-2 border-cricket-green/30 rounded-xl p-3 text-center"
          >
            <p className="text-lg font-extrabold text-cricket-green tracking-wide">FREE HIT</p>
            <p className="text-xs text-theme-muted mt-1">Only run-out dismissal is valid</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bowler change required banner ──────────────────────────── */}
      <AnimatePresence>
        {pendingBowlerChange && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-cricket-gold/10 border border-cricket-gold/20 rounded-xl p-3 text-center"
          >
            <p className="text-sm font-bold text-cricket-gold">New Over — Select a Bowler</p>
            <p className="text-xs text-theme-muted mt-1">Different bowler required for each over</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Extras modifier badges ──────────────────────────────────── */}
      <motion.div
        className="flex flex-wrap gap-1.5 justify-center"
        variants={reduceMotion ? undefined : itemVariants}
      >
        {EXTRAS_CONFIG.map(({ mode, label, activeClass }) => (
          <motion.button
            key={mode}
            layout={!reduceMotion}
            onClick={() => setExtrasMode(mode === extrasMode ? 'normal' : mode)}
            aria-label={`${label} delivery modifier`}
            aria-pressed={extrasMode === mode}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors duration-200 flex items-center gap-1 ${
              extrasMode === mode
                ? `${activeClass} border`
                : 'surface-muted border border-[var(--border-subtle)] hover:border-[var(--border-medium)]'
            }`}
          >
            {label}
            <AnimatePresence>
              {extrasMode === mode && (
                <motion.span
                  initial={reduceMotion ? undefined : { opacity: 0, scale: 0 }}
                  animate={reduceMotion ? undefined : { opacity: 0.6, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  onClick={(e) => { e.stopPropagation(); setExtrasMode('normal'); }}
                  className="ml-0.5 hover:opacity-100 cursor-pointer"
                  aria-label={`Dismiss ${label} modifier`}
                >
                  <X size={10} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </motion.div>

      {/* ── Run buttons: Row 1 (0 1 2 3) ────────────────────────────── */}
      <motion.div
        className="grid grid-cols-4 gap-2"
        variants={reduceMotion ? undefined : itemVariants}
      >
        {[0, 1, 2, 3].map((runs) => (
          <motion.button
            key={runs}
            onClick={() => recordRuns(runs)}
            disabled={deliveryMutation.isPending || pendingBowlerChange || scoringDisabled}
            aria-label={`Score ${runs} run${runs !== 1 ? 's' : ''}`}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className={`min-h-[56px] rounded-2xl flex flex-col items-center justify-center
              text-2xl font-extrabold transition-colors duration-150 disabled:opacity-40
              ${runs === 0
                ? 'surface-muted'
                : 'surface-interactive'
              }`}
            style={{ willChange: 'transform' }}
          >
            {runs}
          </motion.button>
        ))}
      </motion.div>

      {/* ── Run buttons: Row 2 (4, 6) ───────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 gap-2"
        variants={reduceMotion ? undefined : itemVariants}
      >
        <motion.button
          onClick={() => recordRuns(4)}
          disabled={deliveryMutation.isPending || pendingBowlerChange || scoringDisabled}
          aria-label="Score 4 runs"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="min-h-[64px] rounded-2xl flex flex-col items-center justify-center
            text-3xl font-extrabold transition-colors duration-150 disabled:opacity-40
            bg-cricket-green/10 text-cricket-green border-2 border-cricket-green/25 hover:bg-cricket-green/15 four-glow btn-ripple"
          style={{ willChange: 'transform' }}
        >
          4
          <span className="text-[9px] font-bold mt-[-2px] tracking-wider opacity-70">FOUR</span>
        </motion.button>
        <motion.button
          onClick={() => recordRuns(6)}
          disabled={deliveryMutation.isPending || pendingBowlerChange || scoringDisabled}
          aria-label="Score 6 runs"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="min-h-[64px] rounded-2xl flex flex-col items-center justify-center
            text-3xl font-extrabold transition-colors duration-150 disabled:opacity-40
            bg-purple-600/10 text-purple-400 border-2 border-purple-500/25 hover:bg-purple-600/15 six-glow btn-ripple"
          style={{ willChange: 'transform' }}
        >
          6
          <span className="text-[9px] font-bold mt-[-2px] tracking-wider opacity-70">SIX</span>
        </motion.button>
      </motion.div>

      {/* ── Wicket button: Row 3 (full width) ───────────────────────── */}
      <motion.div variants={reduceMotion ? undefined : itemVariants}>
        <motion.button
          onClick={() => setShowWicketModal(true)}
          disabled={scoringDisabled}
          aria-label="Record wicket"
          whileTap={reduceMotion ? undefined : { scale: 0.95 }}
          animate={
            !reduceMotion && wicketShake
              ? { x: [0, -2, 2, -2, 2, 0] }
              : { x: 0 }
          }
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="w-full min-h-[56px] rounded-2xl flex items-center justify-center gap-2
            bg-cricket-red/10 text-cricket-red border-2 border-cricket-red/25
            text-lg font-extrabold transition-colors duration-150 disabled:opacity-40
            hover:bg-cricket-red/15 wicket-glow"
          style={{ willChange: 'transform' }}
        >
          <AlertTriangle size={16} className="shrink-0 opacity-70" />
          WICKET
        </motion.button>
      </motion.div>

      {/* ── Win Prediction widget (2nd innings chase) ─────────────────── */}
      <AnimatePresence>
        {prediction && !matchCompleted && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="card p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={12} className="text-cricket-blue" />
              <span className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest">Win Prediction</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Probability bar */}
              <div className="flex-1">
                <div className="flex justify-between text-[10px] font-semibold mb-1">
                  <span className="text-theme-secondary">{matchData?.teams?.[0]?.teamName || 'Team A'}</span>
                  <span className="text-theme-secondary">{matchData?.teams?.[1]?.teamName || 'Team B'}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-input)] overflow-hidden flex">
                  <motion.div
                    className="h-full bg-cricket-blue rounded-l-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${prediction.winProbA}%` }}
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                  />
                  <motion.div
                    className="h-full bg-cricket-green rounded-r-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${prediction.winProbB}%` }}
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold mt-1 tabular-nums">
                  <span className="text-cricket-blue">{prediction.winProbA}%</span>
                  <span className="text-cricket-green">{prediction.winProbB}%</span>
                </div>
              </div>
              {/* Projected score */}
              <div className="text-center pl-3 border-l border-[var(--border-subtle)]">
                <div className="flex items-center gap-1 mb-0.5">
                  <TrendingUp size={10} className="text-theme-muted" />
                  <span className="text-[9px] font-bold text-theme-muted uppercase">Projected</span>
                </div>
                <span className="text-sm font-extrabold text-theme-primary tabular-nums">
                  {prediction.projectedScoreLow}-{prediction.projectedScoreHigh}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Innings Completed Overlay ──────────────────────────────── */}
      <AnimatePresence>
        {inningsCompleted && !matchCompleted && completionInfo && (
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="glass w-full max-w-md p-6 text-center"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <div className="w-14 h-14 rounded-full bg-cricket-gold/15 border-2 border-cricket-gold/30 flex items-center justify-center mx-auto mb-4">
                <Trophy size={24} className="text-cricket-gold" />
              </div>
              <h2 className="text-2xl font-extrabold text-theme-primary mb-2">Innings Over</h2>
              <p className="text-lg text-theme-secondary font-semibold">
                {completionInfo.teamName} scored{' '}
                <span className="text-cricket-gold tabular-nums">
                  {completionInfo.score}/{completionInfo.wickets}
                </span>
              </p>
              <p className="text-sm text-theme-tertiary mt-1 tabular-nums">
                in {completionInfo.overs} overs
              </p>
              <motion.button
                onClick={() => {
                  setInningsCompleted(false);
                  setCompletionInfo(null);
                  queryClient.invalidateQueries({ queryKey: ['match', matchId] });
                }}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                className="mt-6 w-full py-3 rounded-2xl bg-cricket-green/15 text-cricket-green
                  border-2 border-cricket-green/30 font-bold text-sm
                  hover:bg-cricket-green/20 transition-colors"
              >
                Start Next Innings
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Match Completed Overlay ────────────────────────────────── */}
      <AnimatePresence>
        {matchCompleted && completionInfo && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="glass w-full max-w-md p-6 text-center"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 20 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <motion.div
                className="w-16 h-16 rounded-full bg-cricket-gold/20 border-2 border-cricket-gold/40 flex items-center justify-center mx-auto mb-4"
                animate={reduceMotion ? undefined : { rotate: [0, -5, 5, -5, 0] }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <Trophy size={28} className="text-cricket-gold" />
              </motion.div>
              <h2 className="text-2xl font-extrabold text-theme-primary mb-2">Match Over</h2>
              {completionInfo.resultSummary ? (
                <p className="text-lg text-cricket-gold font-semibold">{completionInfo.resultSummary}</p>
              ) : (
                <p className="text-lg text-theme-secondary font-semibold">
                  {completionInfo.teamName}{' '}
                  <span className="text-cricket-gold tabular-nums">
                    {completionInfo.score}/{completionInfo.wickets}
                  </span>
                  <span className="text-theme-tertiary text-sm ml-1">({completionInfo.overs} ov)</span>
                </p>
              )}
              <motion.button
                onClick={() => navigate(`/matches/${matchId}/scorecard`)}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                className="mt-6 w-full py-3 rounded-2xl bg-cricket-gold/15 text-cricket-gold
                  border-2 border-cricket-gold/30 font-bold text-sm
                  hover:bg-cricket-gold/20 transition-colors"
              >
                View Scorecard
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky Undo Button (bottom-right) ───────────────────────── */}
      <motion.button
        onClick={() => undoMutation.mutate()}
        disabled={undoMutation.isPending}
        aria-label="Undo last ball"
        whileTap={reduceMotion ? undefined : { scale: 0.85 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className="fixed bottom-4 right-4 z-30 w-11 h-11 min-w-0 min-h-0 rounded-full
          bg-[var(--bg-card)] border border-[var(--border-medium)] shadow-lg
          flex items-center justify-center text-cricket-gold
          hover:bg-[var(--bg-hover)] transition-colors duration-150
          disabled:opacity-40"
        style={{ willChange: 'transform' }}
      >
        <Undo2 size={16} />
      </motion.button>

      {/* ── Undo Toast ──────────────────────────────────────────────── */}
      <UndoToast
        message={toastMessage}
        visible={toastVisible}
        onUndo={() => {
          undoMutation.mutate();
          setToastVisible(false);
        }}
        onDismiss={() => setToastVisible(false)}
        reduceMotion={reduceMotion}
      />

      {/* ── Milestone Toast ────────────────────────────────────────── */}
      <AnimatePresence>
        {milestoneToast && (
          <motion.div
            className="fixed top-6 left-1/2 z-50 max-w-md w-[calc(100%-2rem)]"
            style={{ x: '-50%' }}
            initial={reduceMotion ? { opacity: 0 } : { y: -60, opacity: 0, scale: 0.9 }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: -60, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          >
            <div className="bg-cricket-gold/15 border border-cricket-gold/40 backdrop-blur-md px-5 py-4 rounded-xl shadow-xl flex items-center gap-3">
              <Trophy size={22} className="text-cricket-gold shrink-0" />
              <span className="text-sm font-semibold text-cricket-gold">{milestoneToast.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Wicket modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showWicketModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end tablet:items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowWicketModal(false);
                setWicketDismissalType(null);
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Wicket dismissal type selector"
          >
            <motion.div
              ref={wicketModalRef}
              className="glass w-full max-w-md p-5"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.95 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">
                  {wicketDismissalType ? 'Confirm Wicket' : 'Dismissal Type'}
                </h3>
                <motion.button
                  ref={firstFocusableRef}
                  onClick={() => {
                    setShowWicketModal(false);
                    setWicketDismissalType(null);
                  }}
                  aria-label="Close wicket modal"
                  whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                  className="w-8 h-8 min-w-0 min-h-0 rounded-lg btn-close flex items-center justify-center transition-colors"
                >
                  <X size={14} />
                </motion.button>
              </div>

              <AnimatePresence mode="wait">
                {!wicketDismissalType ? (
                  /* Step 1: Pick dismissal type */
                  <motion.div
                    key="dismissal-picker"
                    className="grid grid-cols-2 gap-2"
                    initial={reduceMotion ? undefined : { opacity: 0 }}
                    animate={reduceMotion ? undefined : { opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {DISMISSAL_TYPES.filter(type => !isFreeHit || type === 'run_out').map((type, i) => (
                      <motion.button
                        key={type}
                        custom={i}
                        variants={reduceMotion ? undefined : dismissalButtonVariants}
                        initial={reduceMotion ? undefined : 'hidden'}
                        animate={reduceMotion ? undefined : 'visible'}
                        onClick={() => {
                          if (type === 'run_out' || type === 'caught' || type === 'caught_and_bowled') {
                            setWicketDismissalType(type);
                          } else {
                            recordWicket(type);
                          }
                        }}
                        aria-label={`Dismiss by ${type.replace(/_/g, ' ')}`}
                        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                        className="surface-interactive py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wide
                          transition-colors duration-150"
                      >
                        {type.replace(/_/g, ' ')}
                      </motion.button>
                    ))}
                  </motion.div>
                ) : (
                  /* Step 2: Additional details for caught / run_out */
                  <motion.div
                    key="dismissal-details"
                    className="flex flex-col gap-4"
                    initial={reduceMotion ? undefined : { opacity: 0, x: 20 }}
                    animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, x: -20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <div className="text-center">
                      <span className="badge-live text-sm">
                        {wicketDismissalType.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>

                    {/* Caught / Caught & Bowled: fielder note */}
                    {(wicketDismissalType === 'caught' || wicketDismissalType === 'caught_and_bowled') && (
                      <div className="text-center text-xs text-theme-muted bg-[var(--bg-input)] rounded-xl p-3 border border-[var(--border-subtle)]">
                        Fielder selection coming soon
                      </div>
                    )}

                    {/* Run-out: who was dismissed + runs scored */}
                    {wicketDismissalType === 'run_out' && (
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-xs text-theme-muted font-semibold mb-2 text-center">Who was run out?</p>
                          <div className="flex gap-2 justify-center">
                            {[
                              { id: currentStrikerId, label: allPlayerNames[currentStrikerId || ''] || 'Striker' },
                              { id: currentNonStrikerId, label: allPlayerNames[currentNonStrikerId || ''] || 'Non-Striker' },
                            ].filter(b => b.id).map((b) => (
                              <motion.button
                                key={b.id}
                                onClick={() => setRunOutDismissedId(b.id!)}
                                aria-pressed={runOutDismissedId === b.id}
                                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-150 ${
                                  runOutDismissedId === b.id
                                    ? 'bg-cricket-red/20 text-cricket-red border-2 border-cricket-red/40'
                                    : 'bg-[var(--bg-input)] text-theme-secondary border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]'
                                }`}
                              >
                                {b.label}
                              </motion.button>
                            ))}
                          </div>
                        </div>
                        <div>
                        <p className="text-xs text-theme-muted font-semibold mb-2 text-center">Runs completed before run-out</p>
                        <div className="flex gap-2 justify-center">
                          {[0, 1, 2].map((r) => (
                            <motion.button
                              key={r}
                              onClick={() => setWicketRunOutRuns(r)}
                              aria-label={`${r} runs scored on run out`}
                              aria-pressed={wicketRunOutRuns === r}
                              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                              className={`w-12 h-12 min-w-0 min-h-0 rounded-xl text-lg font-bold transition-colors duration-150 ${
                                wicketRunOutRuns === r
                                  ? 'bg-cricket-red/20 text-cricket-red border-2 border-cricket-red/40'
                                  : 'bg-[var(--bg-input)] text-theme-secondary border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]'
                              }`}
                            >
                              {r}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                      </div>
                    )}

                    {/* Confirm / Back */}
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => setWicketDismissalType(null)}
                        aria-label="Go back to dismissal type selection"
                        whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                        className="flex-1 btn-outline text-sm flex items-center justify-center gap-1"
                      >
                        <ChevronLeft size={16} />
                        Back
                      </motion.button>
                      <motion.button
                        onClick={() => recordWicket(
                          wicketDismissalType,
                          wicketRunOutRuns,
                          wicketDismissalType === 'run_out' ? (runOutDismissedId || undefined) : undefined,
                        )}
                        aria-label="Confirm wicket"
                        whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                        className="flex-1 btn-danger text-sm"
                      >
                        Confirm Wicket
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New Batsman modal (after wicket) ────────────────────────── */}
      <AnimatePresence>
        {showNewBatsmanModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end tablet:items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Select new batsman"
          >
            <motion.div
              className="glass w-full max-w-md p-5"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.95 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <h3 className="text-lg font-bold mb-1">New Batsman</h3>
              <p className="text-xs text-theme-muted mb-4">Select the next batsman to come in</p>

              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {battingXi
                  .filter((pid: string) => {
                    // Exclude dismissed batsmen and current active batsmen
                    const entry = battingScorecard.find((b: any) => b.playerId === pid);
                    if (entry?.isOut) return false;
                    if (pid === currentStrikerId || pid === currentNonStrikerId) return false;
                    if (pid === dismissedPlayerId) return false;
                    return true;
                  })
                  .map((pid: string) => {
                    const entry = battingScorecard.find((b: any) => b.playerId === pid);
                    const name = entry?.playerName || allPlayerNames[pid] || 'Batsman';
                    const hasBatted = entry && entry.ballsFaced > 0;
                    return (
                      <motion.button
                        key={pid}
                        whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                        onClick={() => {
                          // Replace the PENDING slot with the selected batsman
                          if (currentStrikerId === 'PENDING_NEW_BATSMAN') {
                            setCurrentStrikerId(pid);
                          } else if (currentNonStrikerId === 'PENDING_NEW_BATSMAN') {
                            setCurrentNonStrikerId(pid);
                          }
                          setShowNewBatsmanModal(false);
                          setDismissedPlayerId(null);
                        }}
                        className="surface-interactive py-3 rounded-xl text-sm font-semibold transition-colors"
                      >
                        <span className="block">{name}</span>
                        {hasBatted && (
                          <span className="text-[10px] text-theme-muted">
                            {entry.runsScored}({entry.ballsFaced})
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Match Chat */}
      {matchId && <MatchChat matchId={matchId} />}
    </motion.div>
  );
}

// ─── Helper ──────────────────────────────────────────────────────────────────

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
