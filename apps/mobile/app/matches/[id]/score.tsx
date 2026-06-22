import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type RecordDeliveryInput } from "../../../lib/api";
import { colors } from "../../../lib/theme";
import { hapticBoundary, hapticWicket, hapticUndo, hapticTap } from "../../../lib/haptics";
import {
  connectSocket,
  joinMatchRoom,
  leaveMatchRoom,
  onMatchEvent,
  disconnectSocket,
} from "../../../lib/socket";
import {
  queueDelivery,
  getPendingCount,
  isOnline,
} from "../../../lib/offline-sync";

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
  selectedExtra: string | null,
  isWicket: boolean,
): RecordDeliveryInput | null {
  const currentInnings = getCurrentInnings(match);
  if (!currentInnings) return null;

  const { strikerId, nonStrikerId, bowlerId } = getScoringContext(match, currentInnings);
  if (!strikerId || !nonStrikerId || !bowlerId) return null;

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
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [isWicket, setIsWicket] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isConnected, setIsConnected] = useState(true);
  const unsubMatchEvent = useRef<(() => void) | null>(null);

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
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

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

  // ─── Offline queue status ───────────────────────────────────────────
  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 3000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  // ─── Network status check ──────────────────────────────────────────
  useEffect(() => {
    const checkNetwork = async () => {
      const online = await isOnline();
      setIsConnected(online);
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initial match fetch
  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  const recordBall = async (runs: number) => {
    if (!id || submitting || !match) return;

    const payload = buildDeliveryPayload(match, runs, selectedExtra, isWicket);
    if (!payload) {
      Alert.alert("Error", "Match is not ready for scoring yet");
      return;
    }

    // Haptic feedback based on scoring action
    if (isWicket) {
      hapticWicket();
    } else if (runs === 4 || runs === 6) {
      hapticBoundary();
    } else {
      hapticTap();
    }

    setSubmitting(true);

    try {
      const online = await isOnline();

      if (online) {
        await api.recordDelivery(id, payload);
      } else {
        // Queue for later sync
        await queueDelivery(id, payload);
        await refreshPendingCount();
      }

      setSelectedExtra(null);
      setIsWicket(false);

      // Only fetch if online; offline state will be reconciled on sync
      if (online) {
        await fetchMatch();
      }
    } catch (err: any) {
      // Network error during request - queue offline
      try {
        await queueDelivery(id, payload);
        await refreshPendingCount();
        setSelectedExtra(null);
        setIsWicket(false);
      } catch {
        Alert.alert("Error", err.message || "Failed to record delivery");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const undoLast = async () => {
    const currentInnings = getCurrentInnings(match);
    if (!id || !currentInnings?.id) return;
    hapticUndo();
    try {
      await api.undoLastBall(id, currentInnings.id);
      await fetchMatch();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to undo");
    }
  };

  const handleExtraToggle = (value: string) => {
    hapticTap();
    setSelectedExtra(selectedExtra === value ? null : value);
  };

  const handleWicketToggle = () => {
    hapticTap();
    setIsWicket(!isWicket);
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
  const striker = scoringContext?.striker;
  const nonStriker = scoringContext?.nonStriker;
  const currentBowler = scoringContext?.bowler;

  return (
    <View className="flex-1 bg-surface-900">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 200 }}>
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
              {striker?.playerName ?? "---"}
            </Text>
            <Text className="text-sm text-surface-300">
              {striker?.runsScored ?? 0} ({striker?.ballsFaced ?? 0})
            </Text>
          </View>
          <View className="flex-1 rounded-lg bg-surface-800 p-3">
            <Text className="text-xs text-surface-400">Non-Striker</Text>
            <Text className="text-base font-semibold text-white">
              {nonStriker?.playerName ?? "---"}
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
            {currentBowler?.playerName ?? "---"}
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

      {/* Scoring pad - fixed at bottom */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-surface-700 bg-surface-850 px-4 pb-8 pt-4">
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
              disabled={submitting}
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
