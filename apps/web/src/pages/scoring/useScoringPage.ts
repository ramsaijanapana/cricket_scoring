import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { api, ApiError } from '../../lib/api';
import { offlineStore } from '../../lib/offline-store';
import { useScoringStore } from '../../stores/scoring-store';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useMatchSocket } from '../../hooks/useMatchSocket';
import { useOfflineReplay } from '../../hooks/useOfflineReplay';
import { useDocumentTitle, matchDocumentTitle } from '../../hooks/useDocumentTitle';
import type { ExtrasMode, CompletionInfo } from './types';
import {
  toBallDisplay,
  getPlayerName,
  getBatStats,
  calcSR,
  getBowlStats,
  calcEcon,
  buildDeliveryDescription,
  computeRunRate,
} from './utils';

export function useScoringPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;

  const {
    inningsScore, inningsWickets, inningsOvers, requiredRunRate,
    recentBalls, addRecentBall, syncStatus, setSyncStatus,
  } = useScoringStore();

  const [extrasMode, setExtrasMode] = useState<ExtrasMode>('normal');
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [wicketDismissalType, setWicketDismissalType] = useState<string | null>(null);
  const [wicketRunOutRuns, setWicketRunOutRuns] = useState(0);
  const [runOutDismissedId, setRunOutDismissedId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [wicketShake, setWicketShake] = useState(false);
  const [currentStrikerId, setCurrentStrikerId] = useState<string | null>(null);
  const [currentNonStrikerId, setCurrentNonStrikerId] = useState<string | null>(null);
  const [currentBowlerId, setCurrentBowlerId] = useState<string | null>(null);
  const [showBowlerSelect, setShowBowlerSelect] = useState(false);
  const [pendingBowlerChange, setPendingBowlerChange] = useState(false);
  const [lastOverBowlerId, setLastOverBowlerId] = useState<string | null>(null);
  const [isFreeHit, setIsFreeHit] = useState(false);
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [dismissedPlayerId, setDismissedPlayerId] = useState<string | null>(null);
  const [inningsCompleted, setInningsCompleted] = useState(false);
  const [matchCompleted, setMatchCompleted] = useState(false);
  const [completionInfo, setCompletionInfo] = useState<CompletionInfo | null>(null);

  const {
    milestoneToast, prediction, breakStatus, dlsTarget, setBreakStatus,
    latestCommentary, deliveryVersion, setLatestCommentary, setDeliveryVersion,
  } = useMatchSocket(matchId);

  useOfflineReplay(matchId);

  const swapStrike = useCallback(() => {
    setCurrentStrikerId(prev => {
      const oldStriker = prev;
      setCurrentNonStrikerId(oldStriker);
      return currentNonStrikerId;
    });
  }, [currentNonStrikerId]);

  const selectStriker = useCallback((playerId: string) => {
    if (playerId === currentStrikerId) return;
    setCurrentNonStrikerId(currentStrikerId);
    setCurrentStrikerId(playerId);
  }, [currentStrikerId]);

  const changeBowler = useCallback((bowlerId: string) => {
    if (pendingBowlerChange && bowlerId === lastOverBowlerId) return;
    setCurrentBowlerId(bowlerId);
    setShowBowlerSelect(false);
    setPendingBowlerChange(false);
  }, [pendingBowlerChange, lastOverBowlerId]);

  const { data: matchData, isLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.getMatch(matchId!),
    enabled: !!matchId,
  });

  useDocumentTitle(matchDocumentTitle(matchData?.teams, 'Scoring'));

  const isRainDelayed = matchData?.status === 'rain_delay' || breakStatus === 'rain_delay';
  const { data: dlsState } = useQuery({
    queryKey: ['dls', matchId],
    queryFn: () => api.getDLS(matchId!),
    enabled: !!matchId && isRainDelayed,
  });

  const currentInnings = matchData?.innings?.find((i: any) => i.status === 'in_progress');
  const completedInnings = matchData?.innings?.find((i: any) => i.status === 'completed');
  const needsStart = matchData && !currentInnings && matchData.status !== 'completed';

  const battingTeam = matchData?.teams?.find((t: any) => t.teamId === currentInnings?.battingTeamId);
  const bowlingTeam = matchData?.teams?.find((t: any) => t.teamId === currentInnings?.bowlingTeamId);
  const battingXi = battingTeam?.playingXi || [];
  const bowlingXi = bowlingTeam?.playingXi || [];
  const battingPlayerNames: Record<string, string> = battingTeam?.playerNames || {};
  const bowlingPlayerNames: Record<string, string> = bowlingTeam?.playerNames || {};
  const allPlayerNames: Record<string, string> = { ...battingPlayerNames, ...bowlingPlayerNames };

  const inningsData = currentInnings as any;
  const battingScorecard: any[] = inningsData?.battingScorecard || [];
  const bowlingScorecard: any[] = inningsData?.bowlingScorecard || [];

  const activeBatsmen = battingScorecard
    .filter((b: any) => !b.isOut && !b.didNotBat && b.ballsFaced > 0)
    .sort((a: any, b: any) => (b.ballsFaced || 0) - (a.ballsFaced || 0));

  const notOutBatsmen = activeBatsmen.length > 0
    ? activeBatsmen
    : battingScorecard.filter((b: any) => !b.isOut && !b.didNotBat).slice(0, 2);

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

  useEffect(() => {
    return () => {
      useScoringStore.getState().reset();
    };
  }, [matchId]);

  useEffect(() => {
    if (!currentInnings) return;
    if (!currentStrikerId && notOutBatsmen.length > 0) {
      setCurrentStrikerId(notOutBatsmen[0]?.playerId || battingXi[0] || null);
    }
    if (!currentNonStrikerId && notOutBatsmen.length > 1) {
      setCurrentNonStrikerId(notOutBatsmen[1]?.playerId || battingXi[1] || null);
    }
    if (!currentBowlerId) {
      const activeBowler = bowlingScorecard
        .filter((b: any) => parseFloat(b.oversBowled) > 0 || b.runsConceded > 0)
        .sort((a: any, b: any) => parseFloat(b.oversBowled || '0') - parseFloat(a.oversBowled || '0'))[0];
      setCurrentBowlerId(activeBowler?.playerId || bowlingXi[0] || null);
    }
  }, [currentInnings?.id, notOutBatsmen.length, bowlingScorecard.length]);

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
        if (result.commentary) {
          setLatestCommentary(result.commentary);
          setDeliveryVersion((v) => v + 1);
        }
        if (result.newStrikerId) setCurrentStrikerId(result.newStrikerId);
        if (result.newNonStrikerId) setCurrentNonStrikerId(result.newNonStrikerId);
        setIsFreeHit(result.delivery?.extraType === 'noball');
        if (result.newStrikerId === 'PENDING_NEW_BATSMAN' || result.newNonStrikerId === 'PENDING_NEW_BATSMAN') {
          setDismissedPlayerId(result.delivery?.dismissedId || null);
          setShowNewBatsmanModal(true);
        }
        if (result.overCompleted) {
          useScoringStore.getState().clearRecentBalls();
          setLastOverBowlerId(currentBowlerId);
          setShowBowlerSelect(true);
          setPendingBowlerChange(true);
        }
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
        setToastMessage('Score was updated by another scorer. Refreshing...');
        setToastVisible(true);
        queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        return;
      }
      setToastMessage(`Error: ${(error as Error).message}`);
      setToastVisible(true);
    },
  });

  const undoMutation = useMutation({
    mutationFn: () => api.undoLastBall(matchId!, currentInnings?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      setToastVisible(false);
    },
  });

  const striker = battingScorecard.find((b: any) => b.playerId === currentStrikerId) || notOutBatsmen[0] || null;
  const nonStriker = battingScorecard.find((b: any) => b.playerId === currentNonStrikerId) || notOutBatsmen[1] || null;

  const activeBowlers = bowlingScorecard
    .filter((b: any) => parseFloat(b.oversBowled) > 0 || b.runsConceded > 0)
    .sort((a: any, b: any) => parseFloat(b.oversBowled || '0') - parseFloat(a.oversBowled || '0'));
  const trackedBowler = currentBowlerId
    ? bowlingScorecard.find((b: any) => b.playerId === currentBowlerId)
    : null;
  const currentBowler = trackedBowler || activeBowlers[0] || null;
  const currentBowlerName = currentBowler
    ? getPlayerName(currentBowler, allPlayerNames[currentBowlerId || ''] || 'Bowler', allPlayerNames)
    : allPlayerNames[currentBowlerId || ''] || 'Bowler';

  const oversStr = currentInnings?.totalOvers || inningsOvers || '0.0';
  const ballsInCurrentOver = parseInt(String(oversStr).split('.')[1] || '0', 10);
  const thisOverBalls = ballsInCurrentOver > 0 ? recentBalls.slice(-ballsInCurrentOver) : [];
  const thisOverRuns = thisOverBalls.reduce((sum, b) => {
    const n = parseInt(b.label.replace(/[^\d]/g, ''), 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const partnershipRuns = inningsData?.currentPartnership?.runs ?? inningsData?.partnership?.runs ?? null;
  const partnershipBalls = inningsData?.currentPartnership?.balls ?? inningsData?.partnership?.balls ?? null;
  const rrr = inningsData?.requiredRunRate ?? requiredRunRate ?? null;
  const isChasing = !!(currentInnings?.targetScore);
  const score = currentInnings
    ? `${currentInnings.totalRuns ?? 0}/${currentInnings.totalWickets ?? 0}`
    : `${inningsScore}/${inningsWickets}`;

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
    } else if (extrasMode === 'bye' || extrasMode === 'legbye' || extrasMode === 'penalty') {
      input.runs_extras = runs;
    }
    input.total_runs = input.runs_batsman + input.runs_extras;
    addRecentBall(toBallDisplay(runs, extrasMode, false));
    deliveryMutation.mutate(input);
    setToastMessage(buildDeliveryDescription(runs, extrasMode, false));
    setToastVisible(true);
  }, [currentInnings, extrasMode, deliveryMutation, addRecentBall, battingXi, bowlingXi, currentStrikerId, currentNonStrikerId, currentBowlerId]);

  const recordWicket = useCallback((wicketType: string, runsOnWicket = 0, dismissedId?: string) => {
    if (!currentInnings) return;
    const resolvedDismissedId = dismissedId || currentStrikerId || battingXi[0] || 'unknown';
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
    input.total_runs = wicketType === 'run_out' && runsOnWicket > 0 ? runsOnWicket : 0;
    addRecentBall({ label: 'W', type: 'wicket' });
    deliveryMutation.mutate(input);
    setShowWicketModal(false);
    setWicketDismissalType(null);
    setWicketRunOutRuns(0);
    setRunOutDismissedId(null);
    setWicketShake(true);
    setTimeout(() => setWicketShake(false), 500);
    setToastMessage('Wicket!');
    setToastVisible(true);
  }, [currentInnings, deliveryMutation, addRecentBall, battingXi, bowlingXi, currentStrikerId, currentNonStrikerId, currentBowlerId]);

  const overs = currentInnings?.totalOvers || inningsOvers;
  const computedRunRate = computeRunRate(
    currentInnings?.totalRuns ?? inningsScore ?? 0,
    currentInnings?.totalOvers || inningsOvers || '0.0',
  );
  const strikerStats = getBatStats(striker);
  const nonStrikerStats = getBatStats(nonStriker);
  const bowlerStats = currentBowler ? getBowlStats(currentBowler) : null;
  const scoringDisabled = inningsCompleted || matchCompleted;

  const activeBreak: 'innings_break' | 'rain_delay' | null =
    breakStatus
    ?? (matchData?.status === 'innings_break' || matchData?.status === 'rain_delay' ? matchData.status : null)
    ?? (inningsCompleted && !matchCompleted ? 'innings_break' : null);

  const chasingInnings = matchData?.innings?.find((i: any) => i.targetScore != null);
  const breakTargetScore = chasingInnings?.targetScore
    ?? (completedInnings ? (completedInnings as any).totalRuns + 1 : undefined);
  const effectiveDlsTarget = dlsTarget ?? dlsState?.revisedTarget ?? undefined;
  const showLocalInningsBreakAction = activeBreak === 'innings_break' && inningsCompleted && !matchCompleted;
  const teamAName = matchData?.teams?.[0]?.teamName || 'Team A';
  const teamBName = matchData?.teams?.[1]?.teamName || 'Team B';

  const closeWicketModal = useCallback(() => setShowWicketModal(false), []);
  const clearWicketDismissalType = useCallback(() => setWicketDismissalType(null), []);
  const handleDismissalTypeSelect = useCallback((type: string) => setWicketDismissalType(type), []);

  const startNextInnings = useCallback(() => {
    setInningsCompleted(false);
    setCompletionInfo(null);
    setBreakStatus(null);
    queryClient.invalidateQueries({ queryKey: ['match', matchId] });
  }, [matchId, queryClient, setBreakStatus]);

  return {
    matchId, navigate, reduceMotion, syncStatus, isLoading, needsStart, matchData, currentInnings,
    battingTeam, bowlingTeam, battingXi, bowlingXi, allPlayerNames, battingScorecard, bowlingScorecard,
    striker, nonStriker, strikerStats, nonStrikerStats, currentBowlerName, bowlerStats,
    score, overs, computedRunRate, isChasing, rrr, thisOverBalls, thisOverRuns,
    partnershipRuns, partnershipBalls, isFreeHit, pendingBowlerChange, showBowlerSelect,
    setShowBowlerSelect, lastOverBowlerId, currentBowlerId, scoringDisabled, extrasMode, setExtrasMode,
    showWicketModal, setShowWicketModal, wicketDismissalType, wicketRunOutRuns, runOutDismissedId,
    wicketShake, toastVisible, toastMessage, setToastVisible, showNewBatsmanModal, setShowNewBatsmanModal,
    dismissedPlayerId, setDismissedPlayerId, currentStrikerId, currentNonStrikerId,
    setCurrentStrikerId, setCurrentNonStrikerId, inningsCompleted, matchCompleted, completionInfo,
    milestoneToast, prediction, activeBreak, breakTargetScore, effectiveDlsTarget,
    showLocalInningsBreakAction, teamAName, teamBName, latestCommentary, deliveryVersion, inningsScore,
    deliveryMutation, undoMutation, swapStrike, selectStriker, changeBowler, recordRuns, recordWicket,
    closeWicketModal, clearWicketDismissalType, handleDismissalTypeSelect, setRunOutDismissedId,
    setWicketRunOutRuns, startNextInnings,
    getPlayerName: (entry: any, fallback: string) => getPlayerName(entry, fallback, allPlayerNames),
    calcSR, calcEcon,
  };
}
