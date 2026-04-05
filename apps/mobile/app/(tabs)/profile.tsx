import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { storage } from "../../lib/storage";
import { api } from "../../lib/api";
import { useRouter } from "expo-router";

interface UserProfile {
  id: string;
  displayName: string | null;
  email: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  primaryRole: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
}

interface SettingsRowProps {
  icon: string;
  label: string;
  onPress?: () => void;
  trailing?: string;
}

function SettingsRow({ icon, label, onPress, trailing }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-surface-800 px-4 py-3.5 active:bg-surface-800"
    >
      <Ionicons
        name={icon as any}
        size={22}
        color={colors.surface[400]}
        style={{ marginRight: 12 }}
      />
      <Text className="flex-1 text-base text-white">{label}</Text>
      {trailing && (
        <Text className="text-sm text-surface-400">{trailing}</Text>
      )}
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.surface[500]}
        style={{ marginLeft: 8 }}
      />
    </Pressable>
  );
}

function ProfileField({
  label,
  value,
  editing,
  field,
  onChangeText,
}: {
  label: string;
  value: string;
  editing: boolean;
  field: string;
  onChangeText: (field: string, text: string) => void;
}) {
  return (
    <View className="mb-4 px-4">
      <Text className="mb-1 text-xs font-semibold uppercase text-surface-500">
        {label}
      </Text>
      {editing ? (
        <TextInput
          className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-base text-white"
          value={value}
          onChangeText={(t) => onChangeText(field, t)}
          placeholderTextColor={colors.surface[500]}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      ) : (
        <Text className="text-base text-white">
          {value || "Not set"}
        </Text>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [isGuest, setIsGuest] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await api.getMyProfile();
      setProfile(data);
      setEditData({
        city: data.city || "",
        country: data.country || "",
        primaryRole: data.primaryRole || "",
        battingStyle: data.battingStyle || "",
        bowlingStyle: data.bowlingStyle || "",
        bio: data.bio || "",
      });
      setIsGuest(false);
    } catch {
      setIsGuest(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFieldChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(editData)) {
        if (val !== ((profile as any)?.[key] || "")) {
          updates[key] = val || null;
        }
      }
      if (Object.keys(updates).length > 0) {
        const updated = await api.updateMyProfile(updates);
        setProfile(updated);
      }
      setEditing(false);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await storage.removeToken();
          await storage.removeUser();
          setProfile(null);
          setIsGuest(true);
          setEditing(false);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-900">
        <ActivityIndicator size="large" color={colors.cricket.green} />
      </View>
    );
  }

  // Guest / unauthenticated view
  if (isGuest || !profile) {
    return (
      <ScrollView className="flex-1 bg-surface-900">
        <View className="items-center pb-6 pt-8">
          <View className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-surface-700">
            <Ionicons name="person" size={48} color={colors.surface[400]} />
          </View>
          <Text className="text-xl font-bold text-white">Guest User</Text>
          <Text className="mt-1 text-sm text-surface-400">
            Sign in to sync your data
          </Text>
          <Pressable className="mt-4 rounded-lg bg-cricket-green px-6 py-2.5 active:opacity-80">
            <Text className="font-semibold text-white">Sign In</Text>
          </Pressable>
        </View>

        <View className="mb-6">
          <Text className="mb-1 px-4 py-2 text-xs font-semibold uppercase text-surface-500">
            Scoring
          </Text>
          <SettingsRow
            icon="baseball-outline"
            label="Default Format"
            trailing="T20"
          />
          <SettingsRow
            icon="swap-horizontal-outline"
            label="Auto Rotate Strike"
            trailing="On"
          />
        </View>

        <View className="mb-6">
          <Text className="mb-1 px-4 py-2 text-xs font-semibold uppercase text-surface-500">
            App
          </Text>
          <SettingsRow icon="notifications-outline" label="Notifications" />
          <SettingsRow
            icon="moon-outline"
            label="Appearance"
            trailing="Dark"
          />
          <SettingsRow icon="information-circle-outline" label="About" />
        </View>

        <View className="items-center py-8">
          <Text className="text-xs text-surface-500">CricScore v1.0.0</Text>
        </View>
      </ScrollView>
    );
  }

  // Authenticated profile view
  return (
    <ScrollView className="flex-1 bg-surface-900">
      {/* Avatar + Name */}
      <View className="items-center pb-4 pt-8">
        <View className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-surface-700">
          <Ionicons name="person" size={48} color={colors.cricket.green} />
        </View>
        <Text className="text-xl font-bold text-white">
          {profile.displayName || "Cricket Fan"}
        </Text>
        {profile.email && (
          <Text className="mt-1 text-sm text-surface-400">{profile.email}</Text>
        )}
      </View>

      {/* Edit / Save toggle */}
      <View className="flex-row justify-center gap-3 px-4 pb-4">
        {editing ? (
          <>
            <Pressable
              onPress={() => {
                setEditing(false);
                setEditData({
                  city: profile.city || "",
                  country: profile.country || "",
                  primaryRole: profile.primaryRole || "",
                  battingStyle: profile.battingStyle || "",
                  bowlingStyle: profile.bowlingStyle || "",
                  bio: profile.bio || "",
                });
              }}
              className="rounded-lg border border-surface-600 px-5 py-2 active:opacity-80"
            >
              <Text className="font-medium text-surface-300">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="flex-row items-center rounded-lg bg-cricket-green px-5 py-2 active:opacity-80"
            >
              {saving && (
                <ActivityIndicator
                  size="small"
                  color={colors.white}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text className="font-semibold text-white">Save</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => setEditing(true)}
            className="flex-row items-center rounded-lg border border-surface-600 px-5 py-2 active:opacity-80"
          >
            <Ionicons
              name="pencil-outline"
              size={16}
              color={colors.surface[300]}
              style={{ marginRight: 6 }}
            />
            <Text className="font-medium text-surface-300">Edit Profile</Text>
          </Pressable>
        )}
      </View>

      {/* Profile fields */}
      <View className="mb-6">
        <Text className="mb-2 px-4 py-2 text-xs font-semibold uppercase text-surface-500">
          Cricket Profile
        </Text>
        <ProfileField
          label="Primary Role"
          value={editing ? editData.primaryRole : profile.primaryRole || ""}
          editing={editing}
          field="primaryRole"
          onChangeText={handleFieldChange}
        />
        <ProfileField
          label="Batting Style"
          value={editing ? editData.battingStyle : profile.battingStyle || ""}
          editing={editing}
          field="battingStyle"
          onChangeText={handleFieldChange}
        />
        <ProfileField
          label="Bowling Style"
          value={editing ? editData.bowlingStyle : profile.bowlingStyle || ""}
          editing={editing}
          field="bowlingStyle"
          onChangeText={handleFieldChange}
        />
      </View>

      <View className="mb-6">
        <Text className="mb-2 px-4 py-2 text-xs font-semibold uppercase text-surface-500">
          Location
        </Text>
        <ProfileField
          label="City"
          value={editing ? editData.city : profile.city || ""}
          editing={editing}
          field="city"
          onChangeText={handleFieldChange}
        />
        <ProfileField
          label="Country"
          value={editing ? editData.country : profile.country || ""}
          editing={editing}
          field="country"
          onChangeText={handleFieldChange}
        />
      </View>

      <View className="mb-6">
        <Text className="mb-2 px-4 py-2 text-xs font-semibold uppercase text-surface-500">
          Bio
        </Text>
        <ProfileField
          label="About Me"
          value={editing ? editData.bio : profile.bio || ""}
          editing={editing}
          field="bio"
          onChangeText={handleFieldChange}
        />
      </View>

      {/* Settings */}
      <View className="mb-6">
        <Text className="mb-1 px-4 py-2 text-xs font-semibold uppercase text-surface-500">
          Settings
        </Text>
        <SettingsRow icon="notifications-outline" label="Notifications" />
        <SettingsRow
          icon="moon-outline"
          label="Appearance"
          trailing="Dark"
        />
        <SettingsRow icon="information-circle-outline" label="About" />
      </View>

      {/* Logout */}
      <View className="px-4 pb-4">
        <Pressable
          onPress={handleLogout}
          className="flex-row items-center justify-center rounded-lg border border-cricket-red py-3 active:opacity-80"
        >
          <Ionicons
            name="log-out-outline"
            size={20}
            color={colors.cricket.red}
            style={{ marginRight: 8 }}
          />
          <Text className="font-semibold text-cricket-red">Sign Out</Text>
        </Pressable>
      </View>

      <View className="items-center py-8">
        <Text className="text-xs text-surface-500">CricScore v1.0.0</Text>
      </View>
    </ScrollView>
  );
}
