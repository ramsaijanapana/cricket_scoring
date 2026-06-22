import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPlatform } = vi.hoisted(() => ({
  mockPlatform: { OS: "ios" as string },
}));

vi.mock("react-native", () => ({
  Platform: mockPlatform,
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  selectionAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
  NotificationFeedbackType: {
    Warning: "warning",
  },
}));

import * as Haptics from "expo-haptics";
import { hapticBoundary, hapticWicket, hapticUndo, hapticTap } from "./haptics";

describe("haptics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.OS = "ios";
  });

  it("uses medium impact for boundaries", async () => {
    await hapticBoundary();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium,
    );
  });

  it("uses heavy impact for wickets", async () => {
    vi.useFakeTimers();
    await hapticWicket();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Heavy,
    );
    vi.advanceTimersByTime(100);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Warning,
    );
    vi.useRealTimers();
  });

  it("uses light impact for undo", async () => {
    await hapticUndo();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light,
    );
  });

  it("uses selection feedback for taps", async () => {
    await hapticTap();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it("no-ops on web", async () => {
    mockPlatform.OS = "web";
    await hapticBoundary();
    await hapticWicket();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
