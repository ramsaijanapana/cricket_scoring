import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "../../lib/theme";
import { api } from "../../lib/api";

interface ChatRoom {
  id: string;
  type: string;
  name: string | null;
  teamId: string | null;
  matchId: string | null;
  createdAt: string;
  role: string;
  lastReadAt: string | null;
}

export default function ChatScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getChatRooms();
      setRooms(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load chat rooms");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRooms();
  }, [fetchRooms]);

  function getRoomIcon(type: string) {
    switch (type) {
      case "direct":
        return "person-outline";
      case "team":
        return "people-outline";
      case "match":
        return "trophy-outline";
      default:
        return "chatbubble-outline";
    }
  }

  function getRoomDisplayName(room: ChatRoom) {
    if (room.name) return room.name;
    if (room.type === "direct") return "Direct Message";
    if (room.type === "team") return "Team Chat";
    if (room.type === "match") return "Match Chat";
    return "Chat Room";
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <ActivityIndicator size="large" color={colors.cricket.green} />
      </View>
    );
  }

  if (error && rooms.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900 px-8">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-surface-800">
          <Ionicons
            name="chatbubbles-outline"
            size={40}
            color={colors.surface[400]}
          />
        </View>
        <Text className="mb-2 text-xl font-bold text-white">Match Chat</Text>
        <Text className="text-center text-base leading-6 text-surface-400">
          {error}
        </Text>
        <Pressable
          onPress={fetchRooms}
          className="mt-6 rounded-full bg-cricket-green px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-sm font-medium text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (rooms.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900 px-8">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-surface-800">
          <Ionicons
            name="chatbubbles-outline"
            size={40}
            color={colors.surface[400]}
          />
        </View>
        <Text className="mb-2 text-xl font-bold text-white">No Chats Yet</Text>
        <Text className="text-center text-base leading-6 text-surface-400">
          Join a match or team to start chatting with other cricket fans.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-900">
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.cricket.green}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}`)}
            className="flex-row items-center border-b border-surface-800 px-4 py-3.5 active:bg-surface-800"
          >
            <View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-surface-700">
              <Ionicons
                name={getRoomIcon(item.type) as any}
                size={22}
                color={colors.surface[300]}
              />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-white" numberOfLines={1}>
                {getRoomDisplayName(item)}
              </Text>
              <Text className="mt-0.5 text-sm text-surface-400" numberOfLines={1}>
                {item.type === "direct"
                  ? "Private conversation"
                  : `${item.type.charAt(0).toUpperCase()}${item.type.slice(1)} room`}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-surface-500">
                {formatTime(item.createdAt)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
