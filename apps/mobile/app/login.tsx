import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { storage } from "../lib/storage";
import { registerPushTokenIfAuthed } from "../lib/notifications";
import { colors } from "../lib/theme";

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
      const response = await api.login({
        email: email.trim(),
        password,
      });
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

        <Text className="mb-2 text-sm font-semibold text-surface-400">
          EMAIL
        </Text>
        <TextInput
          className="mb-4 rounded-lg bg-surface-800 px-4 py-3 text-base text-white"
          placeholderTextColor={colors.surface[500]}
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text className="mb-2 text-sm font-semibold text-surface-400">
          PASSWORD
        </Text>
        <TextInput
          className="mb-8 rounded-lg bg-surface-800 px-4 py-3 text-base text-white"
          placeholderTextColor={colors.surface[500]}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          className={`items-center rounded-xl py-4 ${
            loading ? "bg-surface-700" : "bg-cricket-green active:opacity-80"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-lg font-bold text-white">Sign In</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
