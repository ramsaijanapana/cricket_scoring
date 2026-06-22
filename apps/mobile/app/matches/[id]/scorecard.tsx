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
import { api, type InningsScorecard } from "../../../lib/api";
import { colors } from "../../../lib/theme";

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [scorecard, setScorecard] = useState<InningsScorecard[]>([]);
  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchScorecard = async () => {
    if (!id) return;
    try {
      const [scorecardData, matchData] = await Promise.all([
        api.getScorecard(id),
        api.getMatch(id),
      ]);
      setScorecard(Array.isArray(scorecardData) ? scorecardData : []);
      setMatch(matchData);
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

  if (!scorecard.length) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <Text className="text-base text-surface-400">
          Scorecard not available
        </Text>
      </View>
    );
  }

  const homeTeam = match?.teams?.find((t: any) => t.designation === "home");
  const awayTeam = match?.teams?.find((t: any) => t.designation === "away");
  const firstInnings = scorecard[0]?.innings;
  const secondInnings = scorecard[1]?.innings;

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
              name: homeTeam?.teamName ?? "Home",
              score: firstInnings?.totalRuns ?? 0,
              wickets: firstInnings?.totalWickets ?? 0,
              overs: firstInnings?.totalOvers?.toString() ?? "0.0",
            }}
            teamB={
              secondInnings
                ? {
                    name: awayTeam?.teamName ?? "Away",
                    score: secondInnings.totalRuns ?? 0,
                    wickets: secondInnings.totalWickets ?? 0,
                    overs: secondInnings.totalOvers?.toString() ?? "0.0",
                  }
                : undefined
            }
            result={match.resultSummary ?? match.result?.summary}
          />
        </View>
      )}

      {/* Innings scorecards */}
      {scorecard.map((entry, idx) => {
        const inn = entry.innings;
        return (
        <View key={inn.id ?? idx} className="mb-6">
          <Text className="mb-3 text-lg font-bold text-white">
            {entry.battingTeamName ?? `Innings ${idx + 1}`}
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
            {(entry.batting ?? []).map((bat) => (
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
          {(entry.bowling ?? []).length > 0 && (
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

              {entry.bowling.map((bowl) => (
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
        );
      })}
    </ScrollView>
  );
}
