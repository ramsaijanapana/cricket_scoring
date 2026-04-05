import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { colors, formatLabels } from "../../lib/theme";
import type { MatchFormat } from "@cricket/shared";

const FORMATS: MatchFormat[] = ["t20", "odi", "test", "t10", "hundred", "custom"];

export default function NewMatchScreen() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [format, setFormat] = useState<MatchFormat>("t20");
  const [venue, setVenue] = useState("");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const data = await api.getTeams();
        setTeams(data);
        if (data.length >= 2) {
          setTeamAId(data[0].id);
          setTeamBId(data[1].id);
        }
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };
    fetchTeams();
  }, []);

  const handleCreate = async () => {
    if (!teamAId || !teamBId) {
      Alert.alert("Error", "Please select both teams");
      return;
    }
    if (teamAId === teamBId) {
      Alert.alert("Error", "Teams must be different");
      return;
    }

    setSubmitting(true);
    try {
      const match = await api.createMatch({
        format,
        teamAId,
        teamBId,
        venue: venue || null,
      });
      router.replace(`/matches/${match.id}/score`);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to create match");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface-900"
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Format selection */}
      <View className="mb-6">
        <Text className="mb-2 text-sm font-semibold text-surface-400">
          FORMAT
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {FORMATS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFormat(f)}
              className={`rounded-lg px-4 py-2.5 ${
                format === f ? "bg-cricket-green" : "bg-surface-800"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  format === f ? "text-white" : "text-surface-300"
                }`}
              >
                {formatLabels[f] || f.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Team A */}
      <View className="mb-6">
        <Text className="mb-2 text-sm font-semibold text-surface-400">
          TEAM A
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.cricket.green} />
        ) : teams.length === 0 ? (
          <Text className="text-sm text-surface-500">
            No teams found. Create teams first.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {teams.map((team) => (
                <Pressable
                  key={team.id}
                  onPress={() => setTeamAId(team.id)}
                  className={`rounded-lg px-4 py-2.5 ${
                    teamAId === team.id ? "bg-cricket-green" : "bg-surface-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      teamAId === team.id ? "text-white" : "text-surface-300"
                    }`}
                  >
                    {team.shortName || team.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Team B */}
      <View className="mb-6">
        <Text className="mb-2 text-sm font-semibold text-surface-400">
          TEAM B
        </Text>
        {!loading && teams.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {teams.map((team) => (
                <Pressable
                  key={team.id}
                  onPress={() => setTeamBId(team.id)}
                  className={`rounded-lg px-4 py-2.5 ${
                    teamBId === team.id ? "bg-cricket-green" : "bg-surface-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      teamBId === team.id ? "text-white" : "text-surface-300"
                    }`}
                  >
                    {team.shortName || team.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Venue */}
      <View className="mb-8">
        <Text className="mb-2 text-sm font-semibold text-surface-400">
          VENUE (optional)
        </Text>
        <TextInput
          className="rounded-lg bg-surface-800 px-4 py-3 text-base text-white"
          placeholderTextColor={colors.surface[500]}
          placeholder="e.g. Melbourne Cricket Ground"
          value={venue}
          onChangeText={setVenue}
        />
      </View>

      {/* Create button */}
      <Pressable
        onPress={handleCreate}
        disabled={submitting || !teamAId || !teamBId}
        className={`items-center rounded-xl py-4 ${
          submitting || !teamAId || !teamBId
            ? "bg-surface-700"
            : "bg-cricket-green active:opacity-80"
        }`}
      >
        {submitting ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-lg font-bold text-white">Create Match</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
