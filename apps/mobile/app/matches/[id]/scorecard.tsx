import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MatchScoreHeader } from "../../../components/ScoreDisplay";
import { api } from "../../../lib/api";
import { colors } from "../../../lib/theme";
import type { BattingScorecard, BowlingScorecard } from "@cricket/shared";

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [scorecard, setScorecard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchScorecard = async () => {
    if (!id) return;
    try {
      const data = await api.getScorecard(id);
      setScorecard(data);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchScorecard();
  }, [id]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <ActivityIndicator size="large" color={colors.cricket.green} />
      </View>
    );
  }

  if (!scorecard) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <Text className="text-base text-surface-400">
          Scorecard not available
        </Text>
      </View>
    );
  }

  const match = scorecard.match;
  const innings = scorecard.innings ?? [];

  return (
    <ScrollView
      className="flex-1 bg-surface-900"
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchScorecard();
          }}
          tintColor={colors.cricket.green}
        />
      }
    >
      {/* Score header */}
      {match && (
        <View className="mb-4">
          <MatchScoreHeader
            status={match.status}
            format={match.format}
            teamA={{
              name: match.teamA?.name ?? "Team A",
              score: innings[0]?.totalRuns ?? 0,
              wickets: innings[0]?.totalWickets ?? 0,
              overs: innings[0]?.totalOvers?.toString() ?? "0.0",
            }}
            teamB={
              innings[1]
                ? {
                    name: match.teamB?.name ?? "Team B",
                    score: innings[1]?.totalRuns ?? 0,
                    wickets: innings[1]?.totalWickets ?? 0,
                    overs: innings[1]?.totalOvers?.toString() ?? "0.0",
                  }
                : undefined
            }
            result={match.result?.summary}
          />
        </View>
      )}

      {/* Innings scorecards */}
      {innings.map((inn: any, idx: number) => (
        <View key={inn.id ?? idx} className="mb-6">
          <Text className="mb-3 text-lg font-bold text-white">
            {inn.battingTeamName ?? `Innings ${idx + 1}`}
          </Text>

          {/* Batting table */}
          <View className="rounded-lg bg-surface-800">
            {/* Header */}
            <View className="flex-row border-b border-surface-700 px-3 py-2">
              <Text className="flex-1 text-xs font-semibold text-surface-400">
                BATTER
              </Text>
              <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                R
              </Text>
              <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                B
              </Text>
              <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                4s
              </Text>
              <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                6s
              </Text>
              <Text className="w-12 text-center text-xs font-semibold text-surface-400">
                SR
              </Text>
            </View>

            {/* Rows */}
            {(inn.batting ?? []).map((bat: any) => (
              <View
                key={bat.playerId}
                className="flex-row border-b border-surface-750 px-3 py-2"
              >
                <View className="flex-1">
                  <Text className="text-sm font-medium text-white">
                    {bat.playerName ?? "Player"}
                  </Text>
                  {bat.dismissalText && (
                    <Text
                      className="text-xs text-surface-400"
                      numberOfLines={1}
                    >
                      {bat.dismissalText}
                    </Text>
                  )}
                  {bat.isNotOut && !bat.didNotBat && (
                    <Text className="text-xs text-cricket-green">not out</Text>
                  )}
                </View>
                <Text className="w-8 text-center text-sm font-bold text-white">
                  {bat.runsScored}
                </Text>
                <Text className="w-8 text-center text-sm text-surface-300">
                  {bat.ballsFaced}
                </Text>
                <Text className="w-8 text-center text-sm text-surface-300">
                  {bat.fours}
                </Text>
                <Text className="w-8 text-center text-sm text-surface-300">
                  {bat.sixes}
                </Text>
                <Text className="w-12 text-center text-sm text-surface-300">
                  {bat.strikeRate?.toFixed(1) ?? "-"}
                </Text>
              </View>
            ))}

            {/* Total */}
            <View className="flex-row px-3 py-2">
              <Text className="flex-1 text-sm font-bold text-white">
                Total
              </Text>
              <Text className="text-sm font-bold text-white">
                {inn.totalRuns}/{inn.totalWickets} ({inn.totalOvers} ov)
              </Text>
            </View>
          </View>

          {/* Bowling table */}
          {(inn.bowling ?? []).length > 0 && (
            <View className="mt-3 rounded-lg bg-surface-800">
              <View className="flex-row border-b border-surface-700 px-3 py-2">
                <Text className="flex-1 text-xs font-semibold text-surface-400">
                  BOWLER
                </Text>
                <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                  O
                </Text>
                <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                  M
                </Text>
                <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                  R
                </Text>
                <Text className="w-8 text-center text-xs font-semibold text-surface-400">
                  W
                </Text>
                <Text className="w-12 text-center text-xs font-semibold text-surface-400">
                  ER
                </Text>
              </View>

              {(inn.bowling ?? []).map((bowl: any) => (
                <View
                  key={bowl.playerId}
                  className="flex-row border-b border-surface-750 px-3 py-2"
                >
                  <Text className="flex-1 text-sm font-medium text-white">
                    {bowl.playerName ?? "Bowler"}
                  </Text>
                  <Text className="w-8 text-center text-sm text-surface-300">
                    {bowl.oversBowled}
                  </Text>
                  <Text className="w-8 text-center text-sm text-surface-300">
                    {bowl.maidens}
                  </Text>
                  <Text className="w-8 text-center text-sm text-surface-300">
                    {bowl.runsConceded}
                  </Text>
                  <Text className="w-8 text-center text-sm font-bold text-white">
                    {bowl.wicketsTaken}
                  </Text>
                  <Text className="w-12 text-center text-sm text-surface-300">
                    {bowl.economyRate?.toFixed(1) ?? "-"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
