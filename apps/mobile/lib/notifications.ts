import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { api } from "./api";

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Configure how notifications are presented when the app is in the foreground.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Notification categories ────────────────────────────────────────────────

export async function setupNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync("wicket", [
    { identifier: "view_scorecard", buttonTitle: "View Scorecard" },
  ]);

  await Notifications.setNotificationCategoryAsync("milestone", [
    { identifier: "view_scorecard", buttonTitle: "View Scorecard" },
  ]);

  await Notifications.setNotificationCategoryAsync("match_complete", [
    { identifier: "view_scorecard", buttonTitle: "View Scorecard" },
    { identifier: "dismiss", buttonTitle: "Dismiss", options: { isDestructive: true } },
  ]);
}

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Request notification permissions and return the Expo push token.
 * Returns null if permissions are denied or the device is a simulator.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("[notifications] Push notifications require a physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[notifications] Permission not granted");
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#16a34a",
    });

    await Notifications.setNotificationChannelAsync("match_events", {
      name: "Match Events",
      description: "Wickets, milestones, and match completions",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#16a34a",
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return token.data;
}

/**
 * Send the push token to the API server for server-initiated notifications.
 */
export async function sendTokenToServer(token: string): Promise<void> {
  try {
    // Use a generic endpoint - the server stores the device token
    await fetch(
      `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api/v1"}/devices/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          platform: Platform.OS,
        }),
      },
    );
  } catch (error) {
    console.warn("[notifications] Failed to register token with server:", error);
  }
}

// ─── Event handling ─────────────────────────────────────────────────────────

/**
 * Set up listeners for incoming notifications (foreground) and
 * notification responses (user taps). Call once at app startup.
 * Returns a cleanup function.
 */
export function setupNotificationListeners(): () => void {
  // Foreground notification received
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const data = notification.request.content.data;
      console.log("[notifications] Received in foreground:", data);
    },
  );

  // User tapped a notification - deep link to the relevant screen
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const actionId = response.actionIdentifier;

      if (data?.matchId) {
        // Navigate to scorecard for the match
        if (
          actionId === "view_scorecard" ||
          actionId === Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
          router.push(`/matches/${data.matchId}/scorecard`);
        }
      }
    });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Initialize the full notification system. Call at app startup.
 */
export async function initNotifications(): Promise<void> {
  await setupNotificationCategories();
  const token = await registerForPushNotifications();
  if (token) {
    await sendTokenToServer(token);
  }
  setupNotificationListeners();
}
