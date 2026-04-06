import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Guard: only trigger haptics on physical devices (no-op on web).
 */
function isHapticsAvailable(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/**
 * Medium impact feedback for boundaries (4s and 6s).
 */
export async function hapticBoundary(): Promise<void> {
  if (!isHapticsAvailable()) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/**
 * Heavy impact + notification feedback for wickets.
 */
export async function hapticWicket(): Promise<void> {
  if (!isHapticsAvailable()) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  // Short pause then a notification buzz for emphasis
  setTimeout(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, 100);
}

/**
 * Light impact feedback for undo actions.
 */
export async function hapticUndo(): Promise<void> {
  if (!isHapticsAvailable()) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * Selection feedback for general button taps.
 */
export async function hapticTap(): Promise<void> {
  if (!isHapticsAvailable()) return;
  await Haptics.selectionAsync();
}
