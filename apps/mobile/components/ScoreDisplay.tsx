import { View, Text } from "react-native";
import { colors, statusColors, formatLabels } from "../lib/theme";

interface ScoreDisplayProps {
  teamName: string;
  score: number;
  wickets: number;
  overs: string;
  isCurrentInnings?: boolean;
  target?: number | null;
}

export function ScoreDisplay({
  teamName,
  score,
  wickets,
  overs,
  isCurrentInnings = false,
  target,
}: ScoreDisplayProps) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <View className="flex-1">
        <Text
          className={`text-base font-semibold ${
            isCurrentInnings ? "text-white" : "text-surface-300"
          }`}
        >
          {teamName}
        </Text>
      </View>
      <View className="flex-row items-baseline gap-1">
        <Text
          className={`text-2xl font-bold ${
            isCurrentInnings ? "text-white" : "text-surface-300"
          }`}
        >
          {score}/{wickets}
        </Text>
        <Text className="text-sm text-surface-400">({overs} ov)</Text>
      </View>
      {target != null && isCurrentInnings && (
        <Text className="ml-2 text-xs text-cricket-gold">
          Need {target - score} from {overs}
        </Text>
      )}
    </View>
  );
}

interface MatchScoreHeaderProps {
  status: string;
  format: string;
  teamA: { name: string; score: number; wickets: number; overs: string };
  teamB?: { name: string; score: number; wickets: number; overs: string };
  currentBattingTeam?: "A" | "B";
  result?: string | null;
}

export function MatchScoreHeader({
  status,
  format,
  teamA,
  teamB,
  currentBattingTeam,
  result,
}: MatchScoreHeaderProps) {
  const statusColor = statusColors[status] || colors.surface[400];

  return (
    <View className="rounded-xl bg-surface-800 p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <View
          className="rounded-full px-2 py-0.5"
          style={{ backgroundColor: statusColor }}
        >
          <Text className="text-xs font-bold uppercase text-white">
            {status === "live" ? "LIVE" : status.replace("_", " ")}
          </Text>
        </View>
        <Text className="text-xs font-medium text-surface-400">
          {formatLabels[format] || format.toUpperCase()}
        </Text>
      </View>

      <ScoreDisplay
        teamName={teamA.name}
        score={teamA.score}
        wickets={teamA.wickets}
        overs={teamA.overs}
        isCurrentInnings={currentBattingTeam === "A"}
      />
      {teamB && (
        <ScoreDisplay
          teamName={teamB.name}
          score={teamB.score}
          wickets={teamB.wickets}
          overs={teamB.overs}
          isCurrentInnings={currentBattingTeam === "B"}
        />
      )}

      {result && (
        <Text className="mt-2 text-center text-sm font-medium text-cricket-gold">
          {result}
        </Text>
      )}
    </View>
  );
}
