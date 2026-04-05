import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { MatchCard } from "../../components/MatchCard";
import { api } from "../../lib/api";
import type { MatchWithTeams } from "../../lib/api";
import { colors } from "../../lib/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await api.getMatches();
      setMatches(data);
    } catch (err) {
      Alert.alert("Error", "Failed to load matches. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMatches();
  }, [fetchMatches]);

  const liveMatches = matches.filter((m) => m.status === "live");
  const recentMatches = matches
    .filter((m) => m.status === "completed")
    .slice(0, 5);
  const upcomingMatches = matches
    .filter((m) => m.status === "scheduled")
    .slice(0, 5);

  return (
    <ScrollView
      className="flex-1 bg-surface-900"
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.cricket.green}
        />
      }
    >
      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">CricScore</Text>
        <Text className="mt-1 text-sm text-surface-400">
          Live cricket scores and scoring
        </Text>
      </View>

      {/* Quick Actions */}
      <View className="mb-6 flex-row gap-3">
        <Pressable
          onPress={() => router.push("/matches/new")}
          className="flex-1 items-center rounded-xl bg-cricket-green p-4 active:opacity-80"
        >
          <Text className="text-base font-semibold text-white">
            New Match
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/score")}
          className="flex-1 items-center rounded-xl bg-surface-700 p-4 active:opacity-80"
        >
          <Text className="text-base font-semibold text-white">Score</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/matches")}
          className="flex-1 items-center rounded-xl bg-surface-700 p-4 active:opacity-80"
        >
          <Text className="text-base font-semibold text-white">
            Scorecard
          </Text>
        </Pressable>
      </View>

      {/* Loading indicator */}
      {loading && (
        <View className="items-center py-8">
          <ActivityIndicator size="large" color={colors.cricket.green} />
        </View>
      )}

      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <View className="mb-6">
          <View className="mb-3 flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-cricket-red" />
            <Text className="text-lg font-bold text-white">Live Now</Text>
          </View>
          {liveMatches.map((match) => (
            <MatchCard
              key={match.id}
              id={match.id}
              status={match.status}
              format={match.format}
              venue={match.venue}
              teamA={{
                name: match.teamA?.name ?? "Team A",
                shortName: match.teamA?.shortName,
                score: match.teamAScore?.totalRuns,
                wickets: match.teamAScore?.totalWickets,
                overs: match.teamAScore?.totalOvers?.toString(),
              }}
              teamB={{
                name: match.teamB?.name ?? "Team B",
                shortName: match.teamB?.shortName,
                score: match.teamBScore?.totalRuns,
                wickets: match.teamBScore?.totalWickets,
                overs: match.teamBScore?.totalOvers?.toString(),
              }}
            />
          ))}
        </View>
      )}

      {/* Upcoming Matches */}
      {upcomingMatches.length > 0 && (
        <View className="mb-6">
          <Text className="mb-3 text-lg font-bold text-white">Upcoming</Text>
          {upcomingMatches.map((match) => (
            <MatchCard
              key={match.id}
              id={match.id}
              status={match.status}
              format={match.format}
              venue={match.venue}
              scheduledAt={match.scheduledAt}
              teamA={{ name: match.teamA?.name ?? "Team A" }}
              teamB={{ name: match.teamB?.name ?? "Team B" }}
            />
          ))}
        </View>
      )}

      {/* Recent Results */}
      {recentMatches.length > 0 && (
        <View className="mb-6">
          <Text className="mb-3 text-lg font-bold text-white">
            Recent Results
          </Text>
          {recentMatches.map((match) => (
            <MatchCard
              key={match.id}
              id={match.id}
              status={match.status}
              format={match.format}
              venue={match.venue}
              result={match.result?.summary}
              teamA={{
                name: match.teamA?.name ?? "Team A",
                shortName: match.teamA?.shortName,
                score: match.teamAScore?.totalRuns,
                wickets: match.teamAScore?.totalWickets,
                overs: match.teamAScore?.totalOvers?.toString(),
              }}
              teamB={{
                name: match.teamB?.name ?? "Team B",
                shortName: match.teamB?.shortName,
                score: match.teamBScore?.totalRuns,
                wickets: match.teamBScore?.totalWickets,
                overs: match.teamBScore?.totalOvers?.toString(),
              }}
            />
          ))}
        </View>
      )}

      {/* Empty state */}
      {!loading && matches.length === 0 && (
        <View className="items-center py-12">
          <Text className="mb-2 text-lg font-semibold text-surface-400">
            No matches yet
          </Text>
          <Text className="mb-4 text-center text-sm text-surface-500">
            Create your first match to start scoring
          </Text>
          <Pressable
            onPress={() => router.push("/matches/new")}
            className="rounded-lg bg-cricket-green px-6 py-3 active:opacity-80"
          >
            <Text className="font-semibold text-white">Create Match</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
