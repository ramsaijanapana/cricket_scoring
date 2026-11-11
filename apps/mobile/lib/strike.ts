import {
  countsTowardOver,
  crossingRuns,
  resolveStrikerRotation,
} from "@cricket/shared";

export const PENDING_NEW_BATSMAN = "PENDING_NEW_BATSMAN";

export interface StrikePair {
  strikerId: string;
  nonStrikerId: string;
}

export function isPlayablePlayerId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.length > 0 && id !== PENDING_NEW_BATSMAN;
}

/** Keep a server or local strike pair only when both ends are real players. */
export function strikeFromEnds(
  strikerId: string | null | undefined,
  nonStrikerId: string | null | undefined,
): StrikePair | null {
  if (!isPlayablePlayerId(strikerId) || !isPlayablePlayerId(nonStrikerId)) return null;
  if (strikerId === nonStrikerId) return null;
  return { strikerId, nonStrikerId };
}

/**
 * Prefer the remembered ends when both batters are still in. Otherwise fall
 * back to the scorecard heuristic for the opening delivery of a session.
 */
export function chooseStrike(
  remembered: StrikePair | null,
  fallback: StrikePair,
  notOutIds: ReadonlySet<string>,
): StrikePair {
  if (
    remembered &&
    notOutIds.has(remembered.strikerId) &&
    notOutIds.has(remembered.nonStrikerId)
  ) {
    return remembered;
  }
  return fallback;
}

function ballsInOver(totalOvers: string): number {
  const overs = parseFloat(totalOvers || "0");
  if (!Number.isFinite(overs)) return 0;
  return Math.round((overs - Math.floor(overs)) * 10);
}

/**
 * Offline rotation. Uses the same crossing rules as the API so a bye or a
 * single changes who faces the next ball before the device syncs.
 */
export function predictStrikeAfterDelivery(
  current: StrikePair,
  delivery: {
    runs_batsman?: number;
    runs_extras?: number;
    extra_type?: string | null;
    is_wicket?: boolean;
    dismissed_player_id?: string | null;
  },
  totalOvers: string,
): StrikePair | null {
  const extraType = delivery.extra_type ?? null;
  const legal = countsTowardOver(extraType);
  const overCompleted = legal && ballsInOver(totalOvers) + 1 >= 6;
  const rotated = resolveStrikerRotation(
    current.strikerId,
    current.nonStrikerId,
    crossingRuns(delivery.runs_batsman ?? 0, delivery.runs_extras ?? 0, extraType),
    extraType === "wide",
    legal,
    overCompleted,
    delivery.is_wicket ?? false,
    delivery.dismissed_player_id,
  );
  return strikeFromEnds(rotated.newStrikerId, rotated.newNonStrikerId);
}
