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
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { registerSchema } from "@cricket/shared";
import { api } from "../lib/api";
import { storage } from "../lib/storage";
import { registerPushTokenIfAuthed } from "../lib/notifications";
import { colors } from "../lib/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    const parsed = registerSchema.safeParse({
      email: email.trim(),
      password,
      displayName: displayName.trim(),
    });

    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Invalid input";
      Alert.alert("Error", message);
      return;
    }

    setLoading(true);
    try {
      await api.register(parsed.data);

      const response = await api.login({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      await storage.setToken(response.token);
      await storage.setRefreshToken(response.refreshToken);
      const user = await api.getMyProfile();
      await storage.setUser(user);
      registerPushTokenIfAuthed().catch((err) => {
        console.warn("[notifications] push registration failed:", err);
      });

      if (router.canDismiss()) {
        router.dismissAll();
      } else {
        router.replace("/(tabs)/profile");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-surface-900"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-2 text-2xl font-bold text-white">
          Create Account
        </Text>
        <Text className="mb-8 text-sm text-surface-400">
          Register to sync your profile and scoring data
        </Text>

        <Text className="mb-2 text-sm font-semibold text-surface-400">
          DISPLAY NAME
        </Text>
        <TextInput
          className="mb-4 rounded-lg bg-surface-800 px-4 py-3 text-base text-white"
          placeholderTextColor={colors.surface[500]}
          placeholder="Your name"
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
          maxLength={100}
        />

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
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />

        <Pressable
          onPress={handleRegister}
          disabled={loading}
          className={`items-center rounded-xl py-4 ${
            loading ? "bg-surface-700" : "bg-cricket-green active:opacity-80"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-lg font-bold text-white">Create Account</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={loading}
          className="mt-6 items-center py-2 active:opacity-80"
        >
          <Text className="text-sm text-surface-400">
            Already have an account?{" "}
            <Text className="font-semibold text-cricket-green">Sign In</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
