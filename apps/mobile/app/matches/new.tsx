import { useState, useEffect, useMemo } from "react";
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
import type { MatchFormat, Player, Team } from "@cricket/shared";

const FORMATS: MatchFormat[] = ["t20", "odi", "test", "t10", "hundred", "custom"];
const STEPS = ["Setup", "Toss", "Playing XI"] as const;
type Step = (typeof STEPS)[number];

function playerLabel(player: Player) {
  return `${player.firstName} ${player.lastName}`.trim() || "Player";
}

function PlayingXiSelector({
  label,
  teamId,
  selected,
  onChange,
  players,
  onCreatePlayer,
}: {
  label: string;
  teamId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  players: Player[];
  onCreatePlayer: (firstName: string, lastName: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");

  const togglePlayer = (playerId: string) => {
    if (selected.includes(playerId)) {
      onChange(selected.filter((id) => id !== playerId));
      return;
    }
    if (selected.length >= 11) {
      Alert.alert("Limit reached", "Select at most 11 players");
      return;
    }
    onChange([...selected, playerId]);
  };

  const handleAddPlayer = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/);
    const firstName = parts[0] ?? "Player";
    const lastName = parts.slice(1).join(" ");
    await onCreatePlayer(firstName, lastName);
    setNewName("");
  };

  if (!teamId) {
    return (
      <View className="mb-6">
        <Text className="mb-2 text-sm font-semibold text-surface-400">{label}</Text>
        <Text className="text-sm text-surface-500">Select a team first</Text>
      </View>
    );
  }

  return (
    <View className="mb-6">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-surface-400">{label}</Text>
        <Text className="text-xs text-surface-500">{selected.length}/11</Text>
      </View>

      <View className="mb-3 flex-row gap-2">
        <TextInput
          className="flex-1 rounded-lg bg-surface-800 px-4 py-2.5 text-sm text-white"
          placeholderTextColor={colors.surface[500]}
          placeholder="Add player name"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={handleAddPlayer}
        />
        <Pressable
          onPress={handleAddPlayer}
          className="items-center justify-center rounded-lg bg-surface-700 px-4 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">Add</Text>
        </Pressable>
      </View>

      {players.length === 0 ? (
        <Text className="text-sm text-surface-500">
          No players yet. Add names above or leave empty to auto-fill at start.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {players.map((player) => {
            const isSelected = selected.includes(player.id);
            return (
              <Pressable
                key={player.id}
                onPress={() => togglePlayer(player.id)}
                className={`rounded-lg px-3 py-2 ${
                  isSelected ? "bg-cricket-green" : "bg-surface-800"
                }`}
              >
                <Text
                  className={`text-sm ${
                    isSelected ? "font-semibold text-white" : "text-surface-300"
                  }`}
                >
                  {playerLabel(player)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function NewMatchScreen() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("Setup");

  const [format, setFormat] = useState<MatchFormat>("t20");
  const [venue, setVenue] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [tossWinnerId, setTossWinnerId] = useState("");
  const [tossDecision, setTossDecision] = useState<"bat" | "field" | "">("");
  const [homePlayingXi, setHomePlayingXi] = useState<string[]>([]);
  const [awayPlayingXi, setAwayPlayingXi] = useState<string[]>([]);

  const stepIndex = STEPS.indexOf(step);
  const homeTeam = teams.find((t) => t.id === homeTeamId);
  const awayTeam = teams.find((t) => t.id === awayTeamId);
  const tossWinner = teams.find((t) => t.id === tossWinnerId);
  const tossLoserId =
    tossWinnerId && homeTeamId && awayTeamId
      ? tossWinnerId === homeTeamId
        ? awayTeamId
        : homeTeamId
      : "";

  const battingTeamId =
    tossDecision === "bat"
      ? tossWinnerId
      : tossDecision === "field"
        ? tossLoserId
        : "";
  const bowlingTeamId =
    tossDecision === "bat"
      ? tossLoserId
      : tossDecision === "field"
        ? tossWinnerId
        : "";

  const battingOrder = useMemo(() => {
    if (battingTeamId === homeTeamId) return homePlayingXi;
    if (battingTeamId === awayTeamId) return awayPlayingXi;
    return [];
  }, [battingTeamId, homeTeamId, awayTeamId, homePlayingXi, awayPlayingXi]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamData, playerData] = await Promise.all([
          api.getTeams(),
          api.getPlayers(),
        ]);
        setTeams(teamData);
        setPlayers(playerData);
        if (teamData.length >= 2) {
          setHomeTeamId(teamData[0].id);
          setAwayTeamId(teamData[1].id);
        }
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCreatePlayer = async (firstName: string, lastName: string) => {
    try {
      const player = await api.createPlayer({ firstName, lastName });
      setPlayers((prev) => [...prev, player]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create player";
      Alert.alert("Error", message);
      throw err;
    }
  };

  const validateSetup = () => {
    if (!homeTeamId || !awayTeamId) {
      Alert.alert("Error", "Please select both teams");
      return false;
    }
    if (homeTeamId === awayTeamId) {
      Alert.alert("Error", "Teams must be different");
      return false;
    }
    return true;
  };

  const validateToss = () => {
    if (!tossWinnerId) {
      Alert.alert("Error", "Select the toss winner");
      return false;
    }
    if (!tossDecision) {
      Alert.alert("Error", "Select bat or field");
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (step === "Setup" && !validateSetup()) return;
    if (step === "Toss" && !validateToss()) return;
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]);
    }
  };

  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const handleStartMatch = async () => {
    if (!validateSetup() || !validateToss()) return;
    if (!battingTeamId || !bowlingTeamId) {
      Alert.alert("Error", "Could not determine batting and bowling teams");
      return;
    }

    setSubmitting(true);
    try {
      const match = await api.createMatch({
        formatConfigId: format,
        homeTeamId,
        awayTeamId,
        venue: venue || undefined,
        homePlayingXi,
        awayPlayingXi,
      });

      await api.recordToss(match.id, {
        winner_id: tossWinnerId,
        decision: tossDecision as "bat" | "field",
      });

      await api.startMatch(match.id, {
        battingTeamId,
        bowlingTeamId,
        battingOrder,
      });

      router.replace(`/matches/${match.id}/score`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start match";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface-900"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <View className="mb-6">
        <Text className="text-2xl font-bold text-white">New Match</Text>
        <Text className="mt-1 text-sm text-surface-400">
          Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex]}
        </Text>
        <View className="mt-3 flex-row gap-2">
          {STEPS.map((label, index) => (
            <View
              key={label}
              className={`h-1 flex-1 rounded-full ${
                index <= stepIndex ? "bg-cricket-green" : "bg-surface-700"
              }`}
            />
          ))}
        </View>
      </View>

      {step === "Setup" && (
        <>
          <View className="mb-6">
            <Text className="mb-2 text-sm font-semibold text-surface-400">FORMAT</Text>
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

          <View className="mb-6">
            <Text className="mb-2 text-sm font-semibold text-surface-400">TEAM A</Text>
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
                      onPress={() => setHomeTeamId(team.id)}
                      className={`rounded-lg px-4 py-2.5 ${
                        homeTeamId === team.id ? "bg-cricket-green" : "bg-surface-800"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          homeTeamId === team.id ? "text-white" : "text-surface-300"
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

          <View className="mb-6">
            <Text className="mb-2 text-sm font-semibold text-surface-400">TEAM B</Text>
            {!loading && teams.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {teams.map((team) => (
                    <Pressable
                      key={team.id}
                      onPress={() => setAwayTeamId(team.id)}
                      className={`rounded-lg px-4 py-2.5 ${
                        awayTeamId === team.id ? "bg-cricket-green" : "bg-surface-800"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          awayTeamId === team.id ? "text-white" : "text-surface-300"
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

          <View className="mb-2">
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
        </>
      )}

      {step === "Toss" && (
        <>
          <View className="mb-6">
            <Text className="mb-2 text-sm font-semibold text-surface-400">
              TOSS WINNER
            </Text>
            <View className="gap-2">
              {[homeTeam, awayTeam].filter(Boolean).map((team) => (
                <Pressable
                  key={team!.id}
                  onPress={() => setTossWinnerId(team!.id)}
                  className={`rounded-xl px-4 py-4 ${
                    tossWinnerId === team!.id ? "bg-cricket-green" : "bg-surface-800"
                  }`}
                >
                  <Text
                    className={`text-base font-semibold ${
                      tossWinnerId === team!.id ? "text-white" : "text-surface-200"
                    }`}
                  >
                    {team!.shortName || team!.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {tossWinnerId ? (
            <View className="mb-2">
              <Text className="mb-2 text-sm font-semibold text-surface-400">
                {tossWinner?.shortName || tossWinner?.name} ELECTED TO
              </Text>
              <View className="flex-row gap-3">
                {(["bat", "field"] as const).map((choice) => (
                  <Pressable
                    key={choice}
                    onPress={() => setTossDecision(choice)}
                    className={`flex-1 items-center rounded-xl py-5 ${
                      tossDecision === choice ? "bg-cricket-green" : "bg-surface-800"
                    }`}
                  >
                    <Text
                      className={`text-lg font-bold ${
                        tossDecision === choice ? "text-white" : "text-surface-200"
                      }`}
                    >
                      {choice === "bat" ? "Bat" : "Field"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}

      {step === "Playing XI" && (
        <>
          {battingTeamId && bowlingTeamId ? (
            <View className="mb-4 rounded-xl bg-surface-800 p-4">
              <Text className="text-sm text-surface-400">First innings</Text>
              <Text className="mt-1 text-base font-semibold text-white">
                {(battingTeamId === homeTeamId
                  ? homeTeam?.shortName || homeTeam?.name
                  : awayTeam?.shortName || awayTeam?.name) ?? "Batting"}{" "}
                bat,{" "}
                {(bowlingTeamId === homeTeamId
                  ? homeTeam?.shortName || homeTeam?.name
                  : awayTeam?.shortName || awayTeam?.name) ?? "Bowling"}{" "}
                bowl
              </Text>
            </View>
          ) : null}

          <PlayingXiSelector
            label={`${homeTeam?.shortName || homeTeam?.name || "Team A"} — Playing XI`}
            teamId={homeTeamId}
            selected={homePlayingXi}
            onChange={setHomePlayingXi}
            players={players}
            onCreatePlayer={handleCreatePlayer}
          />

          <PlayingXiSelector
            label={`${awayTeam?.shortName || awayTeam?.name || "Team B"} — Playing XI`}
            teamId={awayTeamId}
            selected={awayPlayingXi}
            onChange={setAwayPlayingXi}
            players={players}
            onCreatePlayer={handleCreatePlayer}
          />

          <Text className="text-xs text-surface-500">
            Playing XI is optional. Empty teams get placeholder players when the match starts.
          </Text>
        </>
      )}

      <View className="mt-6 flex-row gap-3">
        {stepIndex > 0 ? (
          <Pressable
            onPress={goBack}
            disabled={submitting}
            className="flex-1 items-center rounded-xl border border-surface-600 py-4 active:opacity-80"
          >
            <Text className="text-base font-semibold text-surface-200">Back</Text>
          </Pressable>
        ) : null}

        {stepIndex < STEPS.length - 1 ? (
          <Pressable
            onPress={goNext}
            disabled={submitting || loading}
            className={`flex-1 items-center rounded-xl py-4 ${
              submitting || loading ? "bg-surface-700" : "bg-cricket-green active:opacity-80"
            }`}
          >
            <Text className="text-base font-bold text-white">Next</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStartMatch}
            disabled={submitting}
            className={`flex-1 items-center rounded-xl py-4 ${
              submitting ? "bg-surface-700" : "bg-cricket-green active:opacity-80"
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-base font-bold text-white">Start Match</Text>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
