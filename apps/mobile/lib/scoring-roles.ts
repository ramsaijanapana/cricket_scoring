/**
 * Who faces the next ball, and who bowls it.
 *
 * The live scoring screen used to re-derive the striker as "the not-out batter
 * with the most balls" after every fetch. A single then left the same batter
 * on strike, so their partner never received runs. It also kept sending the
 * bowler with the most overs, and the API rejects the same bowler for the
 * next over — which the client then queued, blocking every later ball.
 *
 * These helpers follow the same rotation the scoring engine applies
 * (odd batsman runs, then the end change on a completed over, then a
 * dismissal leaves that end pending) and require a different bowler once
 * six legal balls have been bowled.
 */

export const PENDING_NEW_BATSMAN = "PENDING_NEW_BATSMAN";

export const DEFAULT_BALLS_PER_OVER = 6;

export interface DeliveryRoleInput {
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsBatsman: number;
  extraType?: string | null;
  isWicket?: boolean;
  dismissedId?: string | null;
  /** Legal balls already bowled in this over before this delivery. */
  legalBallsBefore: number;
  ballsPerOver?: number;
}

export interface ScoringRoles {
  strikerId: string;
  nonStrikerId: string;
  /** Null when the over has just finished and a different bowler must be chosen. */
  bowlerId: string | null;
  lastBowlerId: string | null;
  legalBallsInOver: number;
  overCompleted: boolean;
}

export interface LastDeliverySnapshot {
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsBatsman?: number;
  extraType?: string | null;
  isWicket?: boolean;
  dismissedId?: string | null;
  legalBallNum?: number;
}

export function isLegalDelivery(extraType: string | null | undefined): boolean {
  return extraType !== "wide" && extraType !== "noball";
}

/**
 * A 4xx is a definite rejection (validation, conflict). Queueing it blocks
 * every later offline ball. Network failures and 5xx can be retried.
 */
export function shouldQueueDeliveryFailure(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status >= 500;
}

export function rolesAfterDelivery(input: DeliveryRoleInput): ScoringRoles {
  const ballsPerOver = input.ballsPerOver ?? DEFAULT_BALLS_PER_OVER;
  const legal = isLegalDelivery(input.extraType);
  const legalBalls = legal ? input.legalBallsBefore + 1 : input.legalBallsBefore;
  const overCompleted = legal && legalBalls >= ballsPerOver;

  let strikerId = input.strikerId;
  let nonStrikerId = input.nonStrikerId;

  if ((input.runsBatsman ?? 0) % 2 === 1) {
    [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
  }
  if (overCompleted) {
    [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
  }

  if (input.isWicket && input.dismissedId) {
    if (input.dismissedId === strikerId) strikerId = PENDING_NEW_BATSMAN;
    else if (input.dismissedId === nonStrikerId) nonStrikerId = PENDING_NEW_BATSMAN;
  }

  return {
    strikerId,
    nonStrikerId,
    bowlerId: overCompleted ? null : input.bowlerId,
    lastBowlerId: overCompleted ? input.bowlerId : null,
    legalBallsInOver: overCompleted ? 0 : legalBalls,
    overCompleted,
  };
}

/**
 * Reconstruct the crease from the latest stored delivery.
 * `legalBallNum` is the cumulative count of legal balls, so the in-over
 * count before that delivery is its position modulo the over length.
 */
export function rolesFromLastDelivery(
  delivery: LastDeliverySnapshot,
  ballsPerOver = DEFAULT_BALLS_PER_OVER,
): ScoringRoles {
  const legal = isLegalDelivery(delivery.extraType);
  const legalBallNum = delivery.legalBallNum ?? 0;
  const legalBeforeRaw = legalBallNum - (legal ? 1 : 0);
  const legalBallsBefore = ((legalBeforeRaw % ballsPerOver) + ballsPerOver) % ballsPerOver;

  return rolesAfterDelivery({
    strikerId: delivery.strikerId,
    nonStrikerId: delivery.nonStrikerId,
    bowlerId: delivery.bowlerId,
    runsBatsman: delivery.runsBatsman ?? 0,
    extraType: delivery.extraType,
    isWicket: delivery.isWicket,
    dismissedId: delivery.dismissedId,
    legalBallsBefore,
    ballsPerOver,
  });
}

export function openingRoles(
  strikerId: string,
  nonStrikerId: string,
  bowlerId: string,
): ScoringRoles {
  return {
    strikerId,
    nonStrikerId,
    bowlerId,
    lastBowlerId: null,
    legalBallsInOver: 0,
    overCompleted: false,
  };
}

/** Not-out batters in batting-position order. Never sorted by balls faced. */
export function notOutBatterIds(
  cards: Array<{ playerId: string; isOut?: boolean; didNotBat?: boolean }>,
): string[] {
  return cards.filter((card) => !card.isOut && !card.didNotBat).map((card) => card.playerId);
}

/**
 * Prefer the engine's rotated ends when this response actually recorded the
 * ball. An idempotent replay describes the ball that was already stored, not
 * who faces next, so the local crease is left alone.
 */
export function rolesFromDeliveryResult(
  current: ScoringRoles,
  delivery: DeliveryRoleInput,
  result: {
    newStrikerId?: string;
    newNonStrikerId?: string;
    overCompleted?: boolean;
    idempotent?: boolean;
  },
): ScoringRoles {
  if (result.idempotent) return current;

  const local = rolesAfterDelivery(delivery);
  if (!result.newStrikerId || !result.newNonStrikerId) return local;

  const overCompleted = result.overCompleted ?? local.overCompleted;
  return {
    strikerId: result.newStrikerId,
    nonStrikerId: result.newNonStrikerId,
    bowlerId: overCompleted ? null : delivery.bowlerId,
    lastBowlerId: overCompleted ? delivery.bowlerId : null,
    legalBallsInOver: overCompleted ? 0 : local.legalBallsInOver,
    overCompleted,
  };
}

/** Restore the crease to the batter and bowler who faced the undone ball. */
export function rolesBeforeDelivery(
  current: ScoringRoles,
  delivery: {
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
    extraType?: string | null;
  },
  ballsPerOver = DEFAULT_BALLS_PER_OVER,
): ScoringRoles {
  const legal = isLegalDelivery(delivery.extraType);
  const legalBallsInOver = !legal
    ? current.legalBallsInOver
    : current.legalBallsInOver === 0
      ? ballsPerOver - 1
      : current.legalBallsInOver - 1;

  return {
    strikerId: delivery.strikerId,
    nonStrikerId: delivery.nonStrikerId,
    bowlerId: delivery.bowlerId,
    lastBowlerId: null,
    legalBallsInOver,
    overCompleted: false,
  };
}
