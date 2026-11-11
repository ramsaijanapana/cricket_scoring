/**
 * Laws-of-cricket accounting shared by the API and offline clients.
 *
 * Clients record:
 * - bye / leg-bye: runsBatsman = 0, runsExtras = runs taken
 * - wide: runsBatsman = 0, runsExtras = 1 penalty + runs taken
 * - no-ball: runsBatsman = runs off the bat, runsExtras = 1 penalty
 * - penalty: runs may be copied into both fields; only one of them is real
 */

export type DeliveryExtraType = "wide" | "noball" | "bye" | "legbye" | "penalty" | null | undefined;

type ExtraTypeInput = string | null | undefined;

export interface ScoredDeliveryRuns {
  runsBatsman: number;
  runsExtras: number;
  totalRuns: number;
}

/** Penalty runs are extras only. A duplicated batsman copy must not be added again. */
export function scoredDeliveryRuns(
  runsBatsman: number,
  runsExtras: number,
  extraType: ExtraTypeInput,
): ScoredDeliveryRuns {
  if (extraType === "penalty") {
    const penaltyRuns = runsExtras > 0 ? runsExtras : runsBatsman;
    return { runsBatsman: 0, runsExtras: penaltyRuns, totalRuns: penaltyRuns };
  }
  return {
    runsBatsman,
    runsExtras,
    totalRuns: runsBatsman + runsExtras,
  };
}

/**
 * Runs that take the batters across.
 * The wide/no-ball penalty and penalty-runs awards do not.
 */
export function crossingRuns(
  runsBatsman: number,
  runsExtras: number,
  extraType: ExtraTypeInput,
): number {
  if (extraType === "wide") return Math.max(0, runsExtras - 1);
  if (extraType === "bye" || extraType === "legbye") return runsExtras;
  if (extraType === "penalty") return 0;
  return runsBatsman;
}

/** Byes, leg-byes, and penalty runs are not debited to the bowler. */
export function bowlerChargeableRuns(
  runsBatsman: number,
  runsExtras: number,
  extraType: ExtraTypeInput,
): number {
  if (extraType === "bye" || extraType === "legbye" || extraType === "penalty") return 0;
  return runsBatsman + runsExtras;
}

/** Wides, no-balls, and penalty awards do not consume a ball of the over. */
export function countsTowardOver(extraType: ExtraTypeInput): boolean {
  return extraType !== "wide" && extraType !== "noball" && extraType !== "penalty";
}

/** Wides and penalty awards are not balls faced by the striker. */
export function countsAsBallFaced(extraType: ExtraTypeInput): boolean {
  return extraType !== "wide" && extraType !== "penalty";
}

export function resolveStrikerRotation(
  strikerId: string,
  nonStrikerId: string,
  crossingRunCount: number,
  _isWide: boolean,
  _isLegal: boolean,
  overCompleted: boolean,
  isWicket: boolean,
  dismissedId?: string | null,
): { newStrikerId: string; newNonStrikerId: string } {
  let newStriker = strikerId;
  let newNonStriker = nonStrikerId;

  if (crossingRunCount % 2 === 1) {
    [newStriker, newNonStriker] = [newNonStriker, newStriker];
  }

  if (overCompleted) {
    [newStriker, newNonStriker] = [newNonStriker, newStriker];
  }

  if (isWicket && dismissedId) {
    if (dismissedId === newStriker) {
      newStriker = "PENDING_NEW_BATSMAN";
    } else if (dismissedId === newNonStriker) {
      newNonStriker = "PENDING_NEW_BATSMAN";
    }
  }

  return { newStrikerId: newStriker, newNonStrikerId: newNonStriker };
}
