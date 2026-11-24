import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Network from "expo-network";
import { api, ApiError, type RecordDeliveryInput } from "../../../lib/api";
import { colors } from "../../../lib/theme";
import { hapticBoundary, hapticWicket, hapticUndo, hapticTap } from "../../../lib/haptics";
import {
  connectSocket,
  joinMatchRoom,
  leaveMatchRoom,
  onMatchEvent,
} from "../../../lib/socket";
import {
  applyOptimisticDelivery,
  reverseOptimisticDelivery,
  queueDelivery,
  removeLastPendingDelivery,
  queueUndo,
  getPendingCount,
  isOnline,
  refreshUndoStackPos,
  setUndoStackPos,
  syncPendingDeliveries,
  showSyncConflictAlert,
} from "../../../lib/offline-sync";
import {
  PENDING_NEW_BATSMAN,
  notOutBatterIds,
  openingRoles,
  rolesAfterDelivery,
  rolesBeforeDelivery,
  rolesFromDeliveryResult,
  rolesFromLastDelivery,
  shouldQueueDeliveryFailure,
  type ScoringRoles,
} from "../../../lib/scoring-roles";

const RUN_BUTTONS = [0, 1, 2, 3, 4, 6] as const;

const EXTRA_TYPES = [
  { label: "Wide", value: "wide" as const },
  { label: "No Ball", value: "noball" as const },
  { label: "Bye", value: "bye" as const },
  { label: "Leg Bye", value: "legbye" as const },
] as const;

function getCurrentInnings(match: any) {
  const inningsList = match?.innings ?? [];
  if (!inningsList.length) return null;
  return (
    inningsList.find((inn: any) => inn.status === "in_progress") ??
    inningsList[inningsList.length - 1]
  );
}

function getScoringContext(match: any, currentInnings: any) {
  const battingTeam = match?.teams?.find(
    (t: any) => t.teamId === currentInnings?.battingTeamId,
  );
  const bowlingTeam = match?.teams?.find(
    (t: any) => t.teamId === currentInnings?.bowlingTeamId,
  );
  const battingXi = battingTeam?.playingXi ?? [];
  const bowlingXi = bowlingTeam?.playingXi ?? [];
  const battingScorecard = currentInnings?.battingScorecard ?? [];
  const bowlingScorecard = currentInnings?.bowlingScorecard ?? [];

  const activeBatsmen = battingScorecard
    .filter((b: any) => !b.isOut && !b.didNotBat && b.ballsFaced > 0)
    .sort((a: any, b: any) => (b.ballsFaced || 0) - (a.ballsFaced || 0));
  const notOutBatsmen =
    activeBatsmen.length > 0
      ? activeBatsmen
      : battingScorecard.filter((b: any) => !b.isOut && !b.didNotBat).slice(0, 2);

  const activeBowlers = bowlingScorecard
    .filter((b: any) => parseFloat(String(b.oversBowled || 0)) > 0 || b.runsConceded > 0)
    .sort(
      (a: any, b: any) =>
        parseFloat(String(b.oversBowled || 0)) - parseFloat(String(a.oversBowled || 0)),
    );

  const strikerId = notOutBatsmen[0]?.playerId ?? battingXi[0] ?? "";
  const nonStrikerId = notOutBatsmen[1]?.playerId ?? battingXi[1] ?? "";
  const bowlerId = activeBowlers[0]?.playerId ?? bowlingXi[0] ?? "";

  return {
    homeTeam: match?.teams?.find((t: any) => t.designation === "home"),
    awayTeam: match?.teams?.find((t: any) => t.designation === "away"),
    battingXi,
    bowlingXi,
    strikerId,
    nonStrikerId,
    bowlerId,
    battingScorecard,
    bowlingScorecard,
    striker: battingScorecard.find((b: any) => b.playerId === strikerId) ?? notOutBatsmen[0],
    nonStriker: battingScorecard.find((b: any) => b.playerId === nonStrikerId) ?? notOutBatsmen[1],
    bowler: activeBowlers[0] ?? null,
  };
}

function buildDeliveryPayload(
  match: any,
  runs: number,
  selectedExtra: RecordDeliveryInput["extra_type"],
  isWicket: boolean,
  roles: ScoringRoles,
): RecordDeliveryInput | null {
  const currentInnings = getCurrentInnings(match);
  if (!currentInnings) return null;

  const { strikerId, nonStrikerId, bowlerId } = roles;
  if (!strikerId || !nonStrikerId || !bowlerId) return null;
  if (strikerId === PENDING_NEW_BATSMAN || nonStrikerId === PENDING_NEW_BATSMAN) return null;

  const payload: RecordDeliveryInput = {
    client_id: crypto.randomUUID(),
    innings_num: currentInnings.inningsNumber,
    striker_id: strikerId,
    non_striker_id: nonStrikerId,
    bowler_id: bowlerId,
    runs_batsman: selectedExtra === "bye" || selectedExtra === "legbye" ? 0 : runs,
    runs_extras: 0,
    extra_type: selectedExtra,
    is_wicket: isWicket,
    wicket_type: null,
    dismissed_player_id: null,
    fielder_id: null,
    is_dead_ball: false,
  };

  if (selectedExtra === "wide") {
    payload.runs_extras = 1 + runs;
    payload.runs_batsman = 0;
  } else if (selectedExtra === "noball") {
    payload.runs_extras = 1;
  } else if (selectedExtra === "bye" || selectedExtra === "legbye") {
    payload.runs_extras = runs;
  }

  if (isWicket) {
    payload.wicket_type = "bowled";
    payload.dismissed_player_id = strikerId;
  }

  return payload;
}

export default function LiveScoringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedExtra, setSelectedExtra] = useState<RecordDeliveryInput["extra_type"]>(null);
  const [isWicket, setIsWicket] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isConnected, setIsConnected] = useState(true);
  const [roles, setRoles] = useState<(ScoringRoles & { inningsId: string }) | null>(null);
  const unsubMatchEvent = useRef<(() => void) | null>(null);
  const undoStackPosRef = useRef(0);
  const rolesInningsRef = useRef<string | null>(null);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const fetchMatch = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getMatch(id);
      setMatch(data);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Refresh pending count from the offline queue
  const refreshPendingCount = useCallback(async () => {
    if (!id) return;
    const count = await getPendingCount(id);
    setPendingCount(count);
  }, [id]);

  const handleSyncConflict = useCallback(
    async (message?: string) => {
      showSyncConflictAlert(message);
      if (id) {
        undoStackPosRef.current = await refreshUndoStackPos(id);
        await refreshPendingCount();
        await fetchMatch();
      }
    },
    [id, fetchMatch, refreshPendingCount],
  );

  // ─── WebSocket setup ────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    let mounted = true;

    async function initSocket() {
      try {
        await connectSocket();
        joinMatchRoom(id!);

        unsubMatchEvent.current = onMatchEvent((event) => {
          if (!mounted) return;
          // Re-fetch match data on any real-time event
          fetchMatch();
        });

        if (mounted) setIsConnected(true);
      } catch {
        if (mounted) setIsConnected(false);
      }
    }

    initSocket();

    return () => {
      mounted = false;
      unsubMatchEvent.current?.();
      if (id) leaveMatchRoom(id);
    };
  }, [id, fetchMatch]);

  // ─── Undo stack position + pending queue ────────────────────────────
  useEffect(() => {
    if (!id) return;

    void refreshUndoStackPos(id).then((pos) => {
      undoStackPosRef.current = pos;
    });
    void refreshPendingCount();
  }, [id, refreshPendingCount]);

  // ─── Network listener + offline replay ──────────────────────────────
  useEffect(() => {
    if (!id) return;

    const replayForMatch = async () => {
      const result = await syncPendingDeliveries({
        matchId: id,
        onConflict: (conflict) => {
          void handleSyncConflict(conflict.message);
        },
      });

      if (result.syncedCount > 0) {
        undoStackPosRef.current = await refreshUndoStackPos(id);
        await refreshPendingCount();
        await fetchMatch();
      }
    };

    const subscription = Network.addNetworkStateListener((state) => {
      const online =
        (state.isConnected ?? false) && (state.isInternetReachable ?? false);
      setIsConnected(online);

      if (online) {
        void replayForMatch();
      }
    });

    void isOnline().then((online) => {
      setIsConnected(online);
      if (online) {
        void replayForMatch();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [id, fetchMatch, handleSyncConflict, refreshPendingCount]);

  // Initial match fetch
  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  // Strike and bowler stay with the crease. Re-reading the scorecard after
  // each ball picks whoever has faced the most deliveries, so a single never
  // changes ends and the same bowler is sent into the next over.
  useEffect(() => {
    const innings = getCurrentInnings(match);
    if (!id || !innings?.id) return;
    if (rolesInningsRef.current === innings.id) return;

    const inningsId = innings.id;
    let cancelled = false;

    void (async () => {
      const context = getScoringContext(match, innings);
      const batters = notOutBatterIds(innings.battingScorecard ?? []);
      const strikerId = batters[0] ?? context.battingXi?.[0];
      const nonStrikerId = batters[1] ?? context.battingXi?.[1];
      const bowlerId = context.bowlingXi?.[0];
      if (!strikerId || !nonStrikerId || !bowlerId) return;

      let next = openingRoles(strikerId, nonStrikerId, bowlerId);
      try {
        const deliveries = await api.getDeliveries(id);
        const last = deliveries.find(
          (delivery) =>
            delivery.inningsId === inningsId &&
            delivery.strikerId &&
            delivery.nonStrikerId &&
            delivery.bowlerId,
        );
        if (last?.strikerId && last.nonStrikerId && last.bowlerId) {
          next = rolesFromLastDelivery({
            strikerId: last.strikerId,
            nonStrikerId: last.nonStrikerId,
            bowlerId: last.bowlerId,
            runsBatsman: last.runsBatsman,
            extraType: last.extraType,
            isWicket: last.isWicket,
            dismissedId: last.dismissedId,
            legalBallNum: last.legalBallNum,
          });
        }
      } catch {
        // Opening pair is enough to score the first ball.
      }

      if (cancelled) return;
      rolesInningsRef.current = inningsId;
      setRoles({ inningsId, ...next });
    })();

    return () => {
      cancelled = true;
    };
  }, [id, match]);

  const recordBall = async (runs: number) => {
    if (!id || submitting || !match || !roles?.bowlerId) return;

    const payload = buildDeliveryPayload(match, runs, selectedExtra, isWicket, roles);
    if (!payload) {
      Alert.alert("Error", "Choose the batter and bowler before the next ball");
      return;
    }

    payload.expected_stack_pos = undoStackPosRef.current;

    // Haptic feedback based on scoring action
    if (isWicket) {
      hapticWicket();
    } else if (runs === 4 || runs === 6) {
      hapticBoundary();
    } else {
      hapticTap();
    }

    setSubmitting(true);
    const previousMatch = match;
    setMatch(applyOptimisticDelivery(match, payload));

    try {
      const online = await isOnline();

      if (online) {
        try {
          const result = await api.recordDelivery(id, payload);
          const nextPos =
            result.delivery?.undoStackPos ??
            undoStackPosRef.current + 1;
          undoStackPosRef.current = nextPos;
          await setUndoStackPos(id, nextPos);
          setRoles((current) =>
            current
              ? {
                  ...rolesFromDeliveryResult(current, {
                    strikerId: payload.striker_id,
                    nonStrikerId: payload.non_striker_id,
                    bowlerId: payload.bowler_id,
                    runsBatsman: payload.runs_batsman,
                    extraType: payload.extra_type,
                    isWicket: payload.is_wicket,
                    dismissedId: payload.dismissed_player_id,
                    legalBallsBefore: current.legalBallsInOver,
                  }, result),
                  inningsId: current.inningsId,
                }
              : current,
          );
          await fetchMatch();
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            setMatch(previousMatch);
            await handleSyncConflict(err.message);
            return;
          }

          if (err instanceof ApiError && !shouldQueueDeliveryFailure(err.status)) {
            setMatch(previousMatch);
            Alert.alert("Error", err.message || "Delivery was rejected");
            return;
          }

          await queueDelivery(id, payload);
          undoStackPosRef.current += 1;
          await setUndoStackPos(id, undoStackPosRef.current);
          await refreshPendingCount();
          setRoles((current) =>
            current
              ? {
                  ...rolesAfterDelivery({
                    strikerId: payload.striker_id,
                    nonStrikerId: payload.non_striker_id,
                    bowlerId: payload.bowler_id,
                    runsBatsman: payload.runs_batsman,
                    extraType: payload.extra_type,
                    isWicket: payload.is_wicket,
                    dismissedId: payload.dismissed_player_id,
                    legalBallsBefore: current.legalBallsInOver,
                  }),
                  inningsId: current.inningsId,
                }
              : current,
          );
        }
      } else {
        await queueDelivery(id, payload);
        undoStackPosRef.current += 1;
        await setUndoStackPos(id, undoStackPosRef.current);
        await refreshPendingCount();
        setRoles((current) =>
          current
            ? {
                ...rolesAfterDelivery({
                  strikerId: payload.striker_id,
                  nonStrikerId: payload.non_striker_id,
                  bowlerId: payload.bowler_id,
                  runsBatsman: payload.runs_batsman,
                  extraType: payload.extra_type,
                  isWicket: payload.is_wicket,
                  dismissedId: payload.dismissed_player_id,
                  legalBallsBefore: current.legalBallsInOver,
                }),
                inningsId: current.inningsId,
              }
            : current,
        );
      }

      setSelectedExtra(null);
      setIsWicket(false);
    } catch (err: any) {
      setMatch(previousMatch);
      Alert.alert("Error", err.message || "Failed to record delivery");
    } finally {
      setSubmitting(false);
    }
  };

  const undoLast = async () => {
    const currentInnings = getCurrentInnings(match);
    if (!id || !currentInnings?.id) return;
    hapticUndo();
    try {
      const lastPayload = await removeLastPendingDelivery(id);
      if (lastPayload) {
        setMatch((current: any) => reverseOptimisticDelivery(current, lastPayload));
        setRoles((current) =>
          current
            ? {
                ...rolesBeforeDelivery(current, {
                  strikerId: lastPayload.striker_id,
                  nonStrikerId: lastPayload.non_striker_id,
                  bowlerId: lastPayload.bowler_id,
                  extraType: lastPayload.extra_type,
                }),
                inningsId: current.inningsId,
              }
            : current,
        );
        undoStackPosRef.current = Math.max(0, undoStackPosRef.current - 1);
        await setUndoStackPos(id, undoStackPosRef.current);
        await refreshPendingCount();
        return;
      }

      const online = await isOnline();
      if (!online) {
        await queueUndo(id, currentInnings.id);
        undoStackPosRef.current = Math.max(0, undoStackPosRef.current - 1);
        await setUndoStackPos(id, undoStackPosRef.current);
        Alert.alert("Offline", "Undo queued for sync when you reconnect.");
        return;
      }

      await api.undoLastBall(id, currentInnings.id);
      undoStackPosRef.current = Math.max(0, undoStackPosRef.current - 1);
      await setUndoStackPos(id, undoStackPosRef.current);
      await fetchMatch();
      try {
        const deliveries = await api.getDeliveries(id);
        const last = deliveries.find(
          (delivery) =>
            delivery.inningsId === currentInnings.id &&
            delivery.strikerId &&
            delivery.nonStrikerId &&
            delivery.bowlerId,
        );
        if (last?.strikerId && last.nonStrikerId && last.bowlerId) {
          setRoles({
            inningsId: currentInnings.id,
            ...rolesFromLastDelivery({
              strikerId: last.strikerId,
              nonStrikerId: last.nonStrikerId,
              bowlerId: last.bowlerId,
              runsBatsman: last.runsBatsman,
              extraType: last.extraType,
              isWicket: last.isWicket,
              dismissedId: last.dismissedId,
              legalBallNum: last.legalBallNum,
            }),
          });
        }
      } catch {
        // The score refresh still shows the undone total.
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to undo");
    }
  };

  const handleExtraToggle = (value: NonNullable<RecordDeliveryInput["extra_type"]>) => {
    hapticTap();
    setSelectedExtra(selectedExtra === value ? null : value);
  };

  const handleWicketToggle = () => {
    hapticTap();
    setIsWicket(!isWicket);
  };

  const playerName = (playerId: string | null | undefined, fallback: string) => {
    if (!playerId || playerId === PENDING_NEW_BATSMAN) return fallback;
    const inningsCards = [
      ...(currentInnings?.battingScorecard ?? []),
      ...(currentInnings?.bowlingScorecard ?? []),
    ];
    const fromCard = inningsCards.find((entry: any) => entry.playerId === playerId)?.playerName;
    if (fromCard) return fromCard;
    for (const team of match?.teams ?? []) {
      const named = team.playerNames?.[playerId];
      if (named) return named;
    }
    return fallback;
  };

  const chooseBowler = async (bowlerId: string) => {
    if (!roles || bowlerId === roles.lastBowlerId) return;
    hapticTap();
    const inningsId = getCurrentInnings(match)?.id;
    if (id && inningsId) {
      try {
        await api.setBowler(id, inningsId, bowlerId);
      } catch {
        // The next delivery still names this bowler; the card is created if needed.
      }
    }
    setRoles({ ...roles, bowlerId, overCompleted: false });
  };

  const chooseReplacementBatter = async (playerId: string) => {
    if (!roles) return;
    hapticTap();
    const inningsId = getCurrentInnings(match)?.id;
    if (id && inningsId) {
      try {
        await api.markNewBatsman(id, inningsId, playerId);
      } catch (err: any) {
        Alert.alert("Error", err.message || "That batter cannot come in");
        return;
      }
    }
    setRoles({
      ...roles,
      strikerId: roles.strikerId === PENDING_NEW_BATSMAN ? playerId : roles.strikerId,
      nonStrikerId: roles.nonStrikerId === PENDING_NEW_BATSMAN ? playerId : roles.nonStrikerId,
    });
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <ActivityIndicator size="large" color={colors.cricket.green} />
      </View>
    );
  }

  const currentInnings = getCurrentInnings(match);
  const scoringContext = currentInnings ? getScoringContext(match, currentInnings) : null;
  const inn = currentInnings;
  const score = inn?.totalRuns ?? 0;
  const wickets = inn?.totalWickets ?? 0;
  const overs = inn?.totalOvers ?? "0.0";
  const runRate = inn?.runRate?.toFixed(2) ?? "0.00";
  const homeTeamName = scoringContext?.homeTeam?.teamName ?? "Home";
  const awayTeamName = scoringContext?.awayTeam?.teamName ?? "Away";
  const strikerId = roles?.strikerId ?? scoringContext?.strikerId;
  const nonStrikerId = roles?.nonStrikerId ?? scoringContext?.nonStrikerId;
  const bowlerId = roles?.bowlerId ?? scoringContext?.bowlerId;
  const striker = currentInnings?.battingScorecard?.find((b: any) => b.playerId === strikerId) ?? scoringContext?.striker;
  const nonStriker = currentInnings?.battingScorecard?.find((b: any) => b.playerId === nonStrikerId) ?? scoringContext?.nonStriker;
  const currentBowler = currentInnings?.bowlingScorecard?.find((b: any) => b.playerId === bowlerId) ?? null;
  const needsBowler = !!roles && !roles.bowlerId;
  const needsBatter = roles?.strikerId === PENDING_NEW_BATSMAN || roles?.nonStrikerId === PENDING_NEW_BATSMAN;
  const bowlingChoices = (scoringContext?.bowlingXi ?? []).filter((playerId: string) => playerId !== roles?.lastBowlerId);
  const batterChoices = (currentInnings?.battingScorecard ?? []).filter((entry: any) => {
    if (!entry?.playerId || entry.isOut) return false;
    if (entry.playerId === strikerId || entry.playerId === nonStrikerId) return false;
    return true;
  });

  return (
    <View className={`flex-1 bg-surface-900${isLandscape ? " flex-row" : ""}`}>
      <ScrollView
        className={isLandscape ? "flex-1" : undefined}
        contentContainerStyle={{ padding: 16, paddingBottom: isLandscape ? 16 : 200 }}
      >
        {/* Connection / Offline status bar */}
        {(!isConnected || pendingCount > 0) && (
          <View
            className={`mb-3 flex-row items-center justify-between rounded-lg px-4 py-2 ${
              !isConnected ? "bg-cricket-red/20" : "bg-cricket-gold/20"
            }`}
          >
            <View className="flex-row items-center gap-2">
              <View
                className={`h-2 w-2 rounded-full ${
                  !isConnected ? "bg-cricket-red" : "bg-cricket-gold"
                }`}
              />
              <Text className="text-xs text-surface-300">
                {!isConnected ? "Offline" : "Online"}
              </Text>
            </View>
            {pendingCount > 0 && (
              <View className="flex-row items-center gap-1 rounded-full bg-cricket-gold px-2 py-0.5">
                <Text className="text-xs font-bold text-surface-900">
                  {pendingCount}
                </Text>
                <Text className="text-xs text-surface-900">pending</Text>
              </View>
            )}
          </View>
        )}

        {!isLandscape && (
          <View className="mb-3 flex-row items-center gap-2 rounded-lg border border-surface-700 bg-surface-800/80 px-3 py-2">
            <Ionicons name="phone-landscape-outline" size={18} color={colors.surface[400]} />
            <Text className="flex-1 text-xs text-surface-400">
              Rotate to landscape for a wider scoring layout
            </Text>
          </View>
        )}


        {/* Score display */}
        <View className="mb-4 items-center rounded-xl bg-surface-800 p-6">
          <Text className="mb-2 text-sm font-medium text-surface-400">
            {homeTeamName} vs {awayTeamName}
          </Text>
          <Text className="text-5xl font-bold text-white">
            {score}/{wickets}
          </Text>
          <Text className="mt-1 text-lg text-surface-300">
            Overs: {overs}
          </Text>
          <Text className="text-sm text-surface-400">
            Run Rate: {runRate}
          </Text>
          {inn?.targetScore && (
            <Text className="mt-2 text-sm font-medium text-cricket-gold">
              Need {inn.targetScore - score} runs from{" "}
              {((inn.totalOversAllowed ?? 20) - parseFloat(String(overs))).toFixed(1)} overs
            </Text>
          )}
        </View>

        {/* Current batsmen */}
        <View className="mb-4 flex-row gap-3">
          <View className="flex-1 rounded-lg bg-surface-800 p-3">
            <Text className="text-xs text-surface-400">Striker</Text>
            <Text className="text-base font-semibold text-white">
              {striker?.playerName ?? playerName(strikerId, needsBatter && roles?.strikerId === PENDING_NEW_BATSMAN ? "New batter" : "---")}
            </Text>
            <Text className="text-sm text-surface-300">
              {striker?.runsScored ?? 0} ({striker?.ballsFaced ?? 0})
            </Text>
          </View>
          <View className="flex-1 rounded-lg bg-surface-800 p-3">
            <Text className="text-xs text-surface-400">Non-Striker</Text>
            <Text className="text-base font-semibold text-white">
              {nonStriker?.playerName ?? playerName(nonStrikerId, needsBatter && roles?.nonStrikerId === PENDING_NEW_BATSMAN ? "New batter" : "---")}
            </Text>
            <Text className="text-sm text-surface-300">
              {nonStriker?.runsScored ?? 0} ({nonStriker?.ballsFaced ?? 0})
            </Text>
          </View>
        </View>

        {/* Current bowler */}
        <View className="mb-4 rounded-lg bg-surface-800 p-3">
          <Text className="text-xs text-surface-400">Bowler</Text>
          <Text className="text-base font-semibold text-white">
            {currentBowler?.playerName ?? playerName(bowlerId, needsBowler ? "Choose bowler" : "---")}
          </Text>
          <Text className="text-sm text-surface-300">
            {currentBowler?.oversBowled ?? "0"}-
            {currentBowler?.maidens ?? 0}-
            {currentBowler?.runsConceded ?? 0}-
            {currentBowler?.wicketsTaken ?? 0}
          </Text>
        </View>

        {/* This over */}
        <View className="mb-4">
          <Text className="mb-2 text-xs font-semibold text-surface-400">
            THIS OVER
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(match?.thisOver ?? []).map((ball: any, i: number) => (
              <View
                key={i}
                className={`h-9 w-9 items-center justify-center rounded-full ${
                  ball.isWicket
                    ? "bg-cricket-red"
                    : ball.extraType
                      ? "bg-cricket-gold"
                      : ball.runs === 4 || ball.runs === 6
                        ? "bg-cricket-green"
                        : "bg-surface-700"
                }`}
              >
                <Text className="text-xs font-bold text-white">
                  {ball.isWicket
                    ? "W"
                    : ball.extraType
                      ? `${ball.runs}${ball.extraType[0].toUpperCase()}`
                      : ball.runs}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Scoring pad */}
      <View
        className={
          isLandscape
            ? "justify-end border-l border-surface-700 bg-surface-850 px-3 pb-6 pt-4"
            : "absolute bottom-0 left-0 right-0 border-t border-surface-700 bg-surface-850 px-4 pb-8 pt-4"
        }
        style={isLandscape ? { width: Math.min(width * 0.42, 420) } : undefined}
      >
        {needsBatter && (
          <View className="mb-3">
            <Text className="mb-2 text-xs font-semibold text-surface-300">
              New batter
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {batterChoices.map((entry: any) => (
                <Pressable
                  key={entry.playerId}
                  onPress={() => chooseReplacementBatter(entry.playerId)}
                  className="rounded-lg bg-surface-700 px-3 py-2 active:opacity-80"
                >
                  <Text className="text-xs font-semibold text-white">
                    {entry.playerName ?? playerName(entry.playerId, "Batter")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {needsBowler && (
          <View className="mb-3">
            <Text className="mb-2 text-xs font-semibold text-surface-300">
              Next bowler
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {bowlingChoices.map((playerId: string) => (
                <Pressable
                  key={playerId}
                  onPress={() => chooseBowler(playerId)}
                  className="rounded-lg bg-cricket-gold px-3 py-2 active:opacity-80"
                >
                  <Text className="text-xs font-semibold text-surface-900">
                    {playerName(playerId, "Bowler")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Extras toggle row */}
        <View className="mb-3 flex-row gap-2">
          {EXTRA_TYPES.map((extra) => (
            <Pressable
              key={extra.value}
              onPress={() => handleExtraToggle(extra.value)}
              className={`flex-1 items-center rounded-lg py-2 ${
                selectedExtra === extra.value
                  ? "bg-cricket-gold"
                  : "bg-surface-700"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  selectedExtra === extra.value
                    ? "text-surface-900"
                    : "text-surface-300"
                }`}
              >
                {extra.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={handleWicketToggle}
            className={`flex-1 items-center rounded-lg py-2 ${
              isWicket ? "bg-cricket-red" : "bg-surface-700"
            }`}
          >
            <Text className="text-xs font-semibold text-white">Wicket</Text>
          </Pressable>
        </View>

        {/* Run buttons */}
        <View className="mb-3 flex-row gap-2">
          {RUN_BUTTONS.map((runs) => (
            <Pressable
              key={runs}
              onPress={() => recordBall(runs)}
              disabled={submitting || needsBowler || needsBatter || !roles}
              className={`flex-1 items-center rounded-xl py-4 ${
                runs === 4
                  ? "bg-cricket-blue"
                  : runs === 6
                    ? "bg-cricket-green"
                    : "bg-surface-700"
              } ${submitting ? "opacity-50" : "active:opacity-80"}`}
            >
              <Text className="text-lg font-bold text-white">{runs}</Text>
            </Pressable>
          ))}
        </View>

        {/* Undo button */}
        <Pressable
          onPress={undoLast}
          className="items-center rounded-lg bg-surface-700 py-2 active:opacity-80"
        >
          <Text className="text-sm font-medium text-surface-300">
            Undo Last Ball
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
