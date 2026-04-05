import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { colors, statusColors, formatLabels } from "../lib/theme";

interface MatchCardTeam {
  name: string;
  shortName?: string;
  score?: number;
  wickets?: number;
  overs?: string;
}

interface MatchCardProps {
  id: string;
  status: string;
  format: string;
  venue?: string | null;
  teamA: MatchCardTeam;
  teamB: MatchCardTeam;
  result?: string | null;
  scheduledAt?: string | null;
}

export function MatchCard({
  id,
  status,
  format,
  venue,
  teamA,
  teamB,
  result,
  scheduledAt,
}: MatchCardProps) {
  const router = useRouter();
  const statusColor = statusColors[status] || colors.surface[400];
  const isLive = status === "live";

  const handlePress = () => {
    if (isLive || status === "completed") {
      router.push(`/matches/${id}/scorecard`);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      className="mb-3 rounded-xl bg-surface-800 p-4 active:bg-surface-750"
    >
      {/* Header: status + format */}
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: statusColor }}
          >
            <Text className="text-xs font-bold uppercase text-white">
              {isLive ? "LIVE" : status.replace("_", " ")}
            </Text>
          </View>
          <Text className="text-xs font-medium text-surface-400">
            {formatLabels[format] || format.toUpperCase()}
          </Text>
        </View>
        {venue && (
          <Text className="text-xs text-surface-400" numberOfLines={1}>
            {venue}
          </Text>
        )}
      </View>

      {/* Team A */}
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="flex-1 text-base font-semibold text-white">
          {teamA.shortName || teamA.name}
        </Text>
        {teamA.score != null && (
          <Text className="text-base font-bold text-white">
            {teamA.score}/{teamA.wickets ?? 0}
            <Text className="text-sm font-normal text-surface-400">
              {" "}
              ({teamA.overs ?? "0.0"})
            </Text>
          </Text>
        )}
      </View>

      {/* Team B */}
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="flex-1 text-base font-semibold text-white">
          {teamB.shortName || teamB.name}
        </Text>
        {teamB.score != null && (
          <Text className="text-base font-bold text-white">
            {teamB.score}/{teamB.wickets ?? 0}
            <Text className="text-sm font-normal text-surface-400">
              {" "}
              ({teamB.overs ?? "0.0"})
            </Text>
          </Text>
        )}
      </View>

      {/* Result or scheduled time */}
      {result && (
        <Text className="text-sm text-cricket-gold">{result}</Text>
      )}
      {!result && scheduledAt && (
        <Text className="text-xs text-surface-400">
          {new Date(scheduledAt).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      )}
    </Pressable>
  );
}
