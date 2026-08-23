import type { ExpoConfig, ConfigContext } from "expo/config";

// Keep native build configuration self-contained so Expo can evaluate it before
// workspace TypeScript packages are bundled.
const brandGreen = "#16a34a";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "CricScore",
  slug: "cricscore",
  version: "1.0.0",
  scheme: "cricscore",
  platforms: ["ios", "android"],
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: brandGreen,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.cricscore.app",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: brandGreen,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: brandGreen,
    },
    package: "com.cricscore.app",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: brandGreen,
    },
    permissions: ["RECEIVE_BOOT_COMPLETED", "VIBRATE", "POST_NOTIFICATIONS"],
  },
  plugins: [
    "expo-font",
    "expo-router",
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: brandGreen, sounds: [] }],
    "expo-sqlite",
  ],
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: "https://u.expo.dev/cricscore",
    enabled: true,
    fallbackToCacheTimeout: 5000,
    checkAutomatically: "ON_LOAD",
  },
  extra: { eas: { projectId: "" } },
  experiments: { typedRoutes: true },
});
