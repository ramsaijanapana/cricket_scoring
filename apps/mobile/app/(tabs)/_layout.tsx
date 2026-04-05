import { Tabs } from "expo-router";
import { TabBarIcon } from "../../components/TabBarIcon";
import { colors } from "../../lib/theme";

export default function TabLayout() {
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
