import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { api } from "../../lib/api";

interface Message {
  id: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  content: string;
  messageType: string;
  replyToId: string | null;
  metadata: any;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const fetchMessages = useCallback(
    async (pageNum = 1, append = false) => {
      if (!id) return;
      try {
        const res = await api.getChatMessages(id, pageNum);
        // API returns messages in descending order; reverse for display (oldest first)
        const sorted = [...res.data].reverse();
        if (append) {
          setMessages((prev) => [...sorted, ...prev]);
        } else {
          setMessages(sorted);
        }
        setHasMore(res.data.length >= 20);
        setPage(pageNum);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || !id || sending) return;
    setSending(true);
    setText("");
    try {
      const msg = await api.sendChatMessage(id, { content });
      setMessages((prev) => [...prev, { ...msg, senderName: null, senderAvatar: null }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setText(content); // restore on failure
    } finally {
      setSending(false);
    }
  }, [text, id, sending]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      fetchMessages(page + 1, true);
    }
  }, [hasMore, loading, page, fetchMessages]);

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: "Chat" }} />
        <View className="flex-1 items-center justify-center bg-surface-900">
          <ActivityIndicator size="large" color={colors.cricket.green} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Chat" }} />
      <KeyboardAvoidingView
        className="flex-1 bg-surface-900"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingVertical: 12 }}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          onStartReached={loadMore}
          onStartReachedThreshold={0.5}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={48}
                color={colors.surface[500]}
              />
              <Text className="mt-4 text-base text-surface-400">
                No messages yet. Start the conversation!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="mb-3">
              <View className="flex-row items-baseline">
                <Text className="text-sm font-semibold text-cricket-green">
                  {item.senderName || item.senderId.slice(0, 8)}
                </Text>
                <Text className="ml-2 text-xs text-surface-500">
                  {formatTime(item.createdAt)}
                </Text>
              </View>
              {item.deletedAt ? (
                <Text className="mt-0.5 text-sm italic text-surface-500">
                  Message deleted
                </Text>
              ) : (
                <Text className="mt-0.5 text-base leading-5 text-white">
                  {item.content}
                </Text>
              )}
            </View>
          )}
        />

        {/* Input bar */}
        <View className="flex-row items-end border-t border-surface-800 bg-surface-900 px-4 py-2">
          <TextInput
            className="mr-2 max-h-24 flex-1 rounded-2xl bg-surface-800 px-4 py-2.5 text-base text-white"
            placeholder="Type a message..."
            placeholderTextColor={colors.surface[500]}
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="default"
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sending}
            className="mb-0.5 h-10 w-10 items-center justify-center rounded-full bg-cricket-green active:opacity-80 disabled:opacity-40"
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
