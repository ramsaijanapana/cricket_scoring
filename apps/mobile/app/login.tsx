import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Button, Input } from "@cricket/ui";
import { api } from "../lib/api";
import { storage } from "../lib/storage";
import { registerPushTokenIfAuthed } from "../lib/notifications";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setLoading(true);
    try {
      const response = await api.login({ email: email.trim(), password });
      await storage.setToken(response.token);
      await storage.setRefreshToken(response.refreshToken);
      const user = await api.getMyProfile();
      await storage.setUser(user);
      registerPushTokenIfAuthed().catch((err) => {
        console.warn("[notifications] push registration failed:", err);
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-surface-900"
    >
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-2xl font-bold text-white">Sign In</Text>
        <Text className="mb-8 text-sm text-surface-400">
          Sign in to sync your profile and scoring data
        </Text>

        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Input
          label="Password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <Button onPress={handleLogin} disabled={loading} loading={loading} fullWidth>
          Sign In
        </Button>

        <Pressable
          onPress={() => router.push("/register")}
          disabled={loading}
          className="mt-6 items-center py-2 active:opacity-80"
        >
          <Text className="text-sm text-surface-400">
            Don&apos;t have an account?{" "}
            <Text className="font-semibold text-cricket-green">Create one</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
