import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../lib/api";
import { colors } from "../../../lib/theme";

const RUN_BUTTONS = [0, 1, 2, 3, 4, 6] as const;

const EXTRA_TYPES = [
  { label: "Wide", value: "wide" },
  { label: "No Ball", value: "noball" },
  { label: "Bye", value: "bye" },
  { label: "Leg Bye", value: "legbye" },
] as const;

export default function LiveScoringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [isWicket, setIsWicket] = useState(false);

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

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  const recordBall = async (runs: number) => {
    if (!id || submitting) return;
    setSubmitting(true);
    try {
      await api.recordDelivery(id, {
        runs_batsman: selectedExtra ? 0 : runs,
        runs_extras: selectedExtra ? runs + 1 : 0,
        extra_type: selectedExtra,
        is_wicket: isWicket,
        total_runs: selectedExtra ? runs + 1 : runs,
      });
      setSelectedExtra(null);
      setIsWicket(false);
      await fetchMatch();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to record delivery");
    } finally {
      setSubmitting(false);
    }
  };

  const undoLast = async () => {
    if (!id || !match?.currentInnings?.id) return;
    try {
      await api.undoLastBall(id, match.currentInnings.id);
      await fetchMatch();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to undo");
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <ActivityIndicator size="large" color={colors.cricket.green} />
      </View>
    );
  }

  const inn = match?.currentInnings;
  const score = inn?.totalRuns ?? 0;
  const wickets = inn?.totalWickets ?? 0;
  const overs = inn?.totalOvers ?? "0.0";
  const runRate = inn?.runRate?.toFixed(2) ?? "0.00";

  return (
    <View className="flex-1 bg-surface-900">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 200 }}>
        {/* Score display */}
        <View className="mb-4 items-center rounded-xl bg-surface-800 p-6">
          <Text className="mb-2 text-sm font-medium text-surface-400">
            {match?.teamA?.name ?? "Team A"} vs {match?.teamB?.name ?? "Team B"}
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
              {match?.striker?.name ?? "---"}
            </Text>
            <Text className="text-sm text-surface-300">
              {match?.striker?.runs ?? 0} ({match?.striker?.balls ?? 0})
            </Text>
          </View>
          <View className="flex-1 rounded-lg bg-surface-800 p-3">
            <Text className="text-xs text-surface-400">Non-Striker</Text>
            <Text className="text-base font-semibold text-white">
              {match?.nonStriker?.name ?? "---"}
            </Text>
            <Text className="text-sm text-surface-300">
              {match?.nonStriker?.runs ?? 0} ({match?.nonStriker?.balls ?? 0})
            </Text>
          </View>
        </View>

        {/* Current bowler */}
        <View className="mb-4 rounded-lg bg-surface-800 p-3">
          <Text className="text-xs text-surface-400">Bowler</Text>
          <Text className="text-base font-semibold text-white">
            {match?.currentBowler?.name ?? "---"}
          </Text>
          <Text className="text-sm text-surface-300">
            {match?.currentBowler?.overs ?? "0"}-
            {match?.currentBowler?.maidens ?? 0}-
            {match?.currentBowler?.runs ?? 0}-
            {match?.currentBowler?.wickets ?? 0}
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
              onPress={() =>
                setSelectedExtra(
                  selectedExtra === extra.value ? null : extra.value
                )
              }
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
            onPress={() => setIsWicket(!isWicket)}
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
