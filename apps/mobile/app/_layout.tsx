import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

export default function RootLayout() {
  return (
    <View className="flex-1 bg-surface-900">
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0a0a0a" },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: "#0a0a0a" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="matches/[id]/scorecard"
          options={{ title: "Scorecard" }}
        />
        <Stack.Screen
          name="matches/[id]/score"
          options={{ title: "Live Scoring" }}
        />
        <Stack.Screen
          name="matches/new"
          options={{ title: "New Match", presentation: "modal" }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{ title: "Chat" }}
        />
      </Stack>
    </View>
  );
}
