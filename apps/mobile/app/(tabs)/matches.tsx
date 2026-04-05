import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
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

type FilterStatus = "all" | "live" | "scheduled" | "completed";

export default function MatchesScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>("all");

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

  const filteredMatches = useMemo(
    () => (filter === "all" ? matches : matches.filter((m) => m.status === filter)),
    [matches, filter],
  );

  const filters: { label: string; value: FilterStatus }[] = [
    { label: "All", value: "all" },
    { label: "Live", value: "live" },
    { label: "Upcoming", value: "scheduled" },
    { label: "Completed", value: "completed" },
  ];

  const renderMatch = useCallback(
    ({ item: match }: { item: any }) => (
      <Pressable onPress={() => router.push(`/matches/${match.id}/scorecard`)}>
        <MatchCard
          id={match.id}
          status={match.status}
          format={match.format}
          venue={match.venue}
          scheduledAt={match.scheduledAt}
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
      </Pressable>
    ),
    [router],
  );

  return (
    <View className="flex-1 bg-surface-900">
      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-12 border-b border-surface-800"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
      >
        {filters.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 ${
              filter === f.value ? "bg-cricket-green" : "bg-surface-800"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                filter === f.value ? "text-white" : "text-surface-300"
              }`}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Match list */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.cricket.green} />
        </View>
      ) : (
        <FlatList
          data={filteredMatches}
          keyExtractor={(item) => item.id}
          renderItem={renderMatch}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.cricket.green}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-12">
              <Text className="text-base text-surface-400">
                No {filter === "all" ? "" : filter} matches found
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={() => router.push("/matches/new")}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-cricket-green shadow-lg active:opacity-80"
      >
        <Text className="text-2xl font-bold text-white">+</Text>
      </Pressable>
    </View>
  );
}
