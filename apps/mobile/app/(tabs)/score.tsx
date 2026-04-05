import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import type { MatchWithTeams } from "../../lib/api";
import { colors } from "../../lib/theme";

export default function ScoreScreen() {
  const router = useRouter();
  const [liveMatches, setLiveMatches] = useState<MatchWithTeams[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await api.getMatches();
      setLiveMatches(data.filter((m) => m.status === "live"));
      setRecentMatches(
        data
          .filter((m) => m.status === "completed" || m.status === "scheduled")
          .slice(0, 5),
      );
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

  const renderMatchItem = useCallback(
    ({ item: match }: { item: any }) => (
      <Pressable
        onPress={() => router.push(`/matches/${match.id}/score`)}
        className="mb-3 rounded-xl bg-surface-800 p-4 active:bg-surface-750"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-base font-semibold text-white">
              {match.teamA?.name ?? "Team A"} vs{" "}
              {match.teamB?.name ?? "Team B"}
            </Text>
            <Text className="mt-1 text-sm text-surface-400">
              {match.venue ?? "Unknown venue"}
            </Text>
          </View>
          <View className="rounded-lg bg-cricket-green px-3 py-1.5">
            <Text className="text-sm font-semibold text-white">Score</Text>
          </View>
        </View>
      </Pressable>
    ),
    [router],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <ActivityIndicator size="large" color={colors.cricket.green} />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-surface-900"
      contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      data={liveMatches}
      keyExtractor={(item) => item.id}
      renderItem={renderMatchItem}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.cricket.green}
        />
      }
      ListHeaderComponent={
        <View>
          {/* Header */}
          <View className="mb-6">
            <Text className="text-2xl font-bold text-white">Score a Match</Text>
            <Text className="mt-1 text-sm text-surface-400">
              Select a live match to score or create a new one
            </Text>
          </View>

          {/* Create new match */}
          <Pressable
            onPress={() => router.push("/matches/new")}
            className="mb-6 flex-row items-center rounded-xl border-2 border-dashed border-surface-600 p-6 active:border-cricket-green"
          >
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-cricket-green">
              <Text className="text-2xl font-bold text-white">+</Text>
            </View>
            <View>
              <Text className="text-base font-semibold text-white">
                Create New Match
              </Text>
              <Text className="text-sm text-surface-400">
                Set up teams, format, and start scoring
              </Text>
            </View>
          </Pressable>

          {/* Live matches header */}
          {liveMatches.length > 0 && (
            <View className="mb-3 flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full bg-cricket-red" />
              <Text className="text-lg font-bold text-white">
                Continue Scoring
              </Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <View className="items-center py-8">
          <Text className="mb-2 text-base text-surface-400">
            No live matches to score
          </Text>
          <Text className="text-center text-sm text-surface-500">
            Create a new match to begin scoring
          </Text>
        </View>
      }
      ListFooterComponent={
        recentMatches.length > 0 ? (
          <View className="mt-6">
            <Text className="mb-3 text-lg font-bold text-white">
              Recent / Upcoming
            </Text>
            {recentMatches.map((match: any) => (
              <Pressable
                key={match.id}
                onPress={() => router.push(`/matches/${match.id}/scorecard`)}
                className="mb-3 rounded-xl bg-surface-800 p-4 active:bg-surface-750"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-white">
                      {match.teamA?.name ?? "Team A"} vs{" "}
                      {match.teamB?.name ?? "Team B"}
                    </Text>
                    <Text className="mt-1 text-xs text-surface-500">
                      {match.status} | {match.venue ?? "TBD"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null
      }
    />
  );
}
