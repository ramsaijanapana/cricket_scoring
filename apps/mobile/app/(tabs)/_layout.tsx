import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { TabBarIcon } from "../../components/TabBarIcon";
import { colors } from "../../lib/theme";
import { api } from "../../lib/api";

export default function TabLayout() {
  const [liveMatchCount, setLiveMatchCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const refreshLiveCount = async () => {
      try {
        const matches = await api.getMatches();
        if (mounted) {
          setLiveMatchCount(matches.filter((m) => m.status === "live").length);
        }
      } catch {
        // ignore — badge stays at last known count
      }
    };

    refreshLiveCount();
    const interval = setInterval(refreshLiveCount, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.cricket.green,
        tabBarInactiveTintColor: colors.surface[400],
        tabBarStyle: {
          backgroundColor: colors.surface[900],
          borderTopColor: colors.surface[800],
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 56,
        },
        headerStyle: { backgroundColor: colors.surface[900] },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="home-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Matches",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="trophy-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="score"
        options={{
          title: "Score",
          tabBarBadge: liveMatchCount > 0 ? liveMatchCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.cricket.red,
            color: colors.white,
            fontSize: 11,
            minWidth: 18,
          },
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="add-circle-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="chatbubble-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="person-outline" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
