import { describe, expect, it } from "vitest";
import {
  notOutBatterIds,
  openingRoles,
  rolesAfterDelivery,
  rolesBeforeDelivery,
  rolesFromDeliveryResult,
  rolesFromLastDelivery,
  shouldQueueDeliveryFailure,
} from "./scoring-roles";

const base = {
  strikerId: "striker",
  nonStrikerId: "non",
  bowlerId: "bowler",
  extraType: null as string | null,
  isWicket: false,
  dismissedId: null as string | null,
};

describe("rolesAfterDelivery", () => {
  it("keeps strike on a dot and gives it to the other batter after a single", () => {
    const afterDot = rolesAfterDelivery({ ...base, runsBatsman: 0, legalBallsBefore: 0 });
    expect(afterDot.strikerId).toBe("striker");
    expect(afterDot.bowlerId).toBe("bowler");

    const afterSingle = rolesAfterDelivery({ ...base, runsBatsman: 1, legalBallsBefore: 3 });
    expect(afterSingle.strikerId).toBe("non");
    expect(afterSingle.nonStrikerId).toBe("striker");
    expect(afterSingle.bowlerId).toBe("bowler");
    expect(afterSingle.overCompleted).toBe(false);
  });

  it("does not hand the next ball back to whoever has faced more deliveries", () => {
    const order = notOutBatterIds([
      { playerId: "opener", isOut: false, didNotBat: false },
      { playerId: "partner", isOut: false, didNotBat: false },
    ]);
    expect(order).toEqual(["opener", "partner"]);

    const next = rolesAfterDelivery({
      ...base,
      strikerId: order[0],
      nonStrikerId: order[1],
      runsBatsman: 1,
      legalBallsBefore: 4,
    });
    expect(next.strikerId).toBe("partner");
  });

  it("requires a different bowler after the sixth legal ball and changes ends", () => {
    const next = rolesAfterDelivery({ ...base, runsBatsman: 0, legalBallsBefore: 5 });
    expect(next.overCompleted).toBe(true);
    expect(next.bowlerId).toBeNull();
    expect(next.lastBowlerId).toBe("bowler");
    expect(next.legalBallsInOver).toBe(0);
    expect(next.strikerId).toBe("non");
  });

  it("does not count a wide as a legal ball or complete the over", () => {
    const next = rolesAfterDelivery({
      ...base,
      runsBatsman: 0,
      extraType: "wide",
      legalBallsBefore: 5,
    });
    expect(next.overCompleted).toBe(false);
    expect(next.bowlerId).toBe("bowler");
    expect(next.legalBallsInOver).toBe(5);
  });

  it("leaves the dismissed end pending after rotating for the runs", () => {
    const next = rolesAfterDelivery({
      ...base,
      runsBatsman: 1,
      isWicket: true,
      dismissedId: "striker",
      legalBallsBefore: 1,
    });
    expect(next.strikerId).toBe("non");
    expect(next.nonStrikerId).toBe("PENDING_NEW_BATSMAN");
  });
});

describe("rolesFromLastDelivery", () => {
  it("resumes with the other batter on strike after a stored single", () => {
    const roles = rolesFromLastDelivery({
      ...base,
      runsBatsman: 1,
      legalBallNum: 4,
    });
    expect(roles.strikerId).toBe("non");
    expect(roles.bowlerId).toBe("bowler");
    expect(roles.legalBallsInOver).toBe(4);
  });

  it("asks for a new bowler when the stored ball completed the over", () => {
    const roles = rolesFromLastDelivery({
      ...base,
      runsBatsman: 0,
      legalBallNum: 6,
    });
    expect(roles.overCompleted).toBe(true);
    expect(roles.bowlerId).toBeNull();
    expect(roles.lastBowlerId).toBe("bowler");
  });

  it("keeps the bowler who bowled a wide at the start of the next over", () => {
    const roles = rolesFromLastDelivery({
      ...base,
      bowlerId: "next-bowler",
      runsBatsman: 0,
      extraType: "wide",
      legalBallNum: 6,
    });
    expect(roles.overCompleted).toBe(false);
    expect(roles.bowlerId).toBe("next-bowler");
    expect(roles.legalBallsInOver).toBe(0);
  });
});

describe("rolesFromDeliveryResult", () => {
  it("uses the engine ends and clears the bowler when the over completes", () => {
    const current = openingRoles("striker", "non", "bowler");
    const next = rolesFromDeliveryResult(
      current,
      { ...base, runsBatsman: 0, legalBallsBefore: 5 },
      { newStrikerId: "non", newNonStrikerId: "striker", overCompleted: true },
    );
    expect(next.strikerId).toBe("non");
    expect(next.bowlerId).toBeNull();
    expect(next.lastBowlerId).toBe("bowler");
  });

  it("leaves the crease unchanged when the server reports an idempotent replay", () => {
    const current = openingRoles("striker", "non", "bowler");
    const next = rolesFromDeliveryResult(
      current,
      { ...base, runsBatsman: 1, legalBallsBefore: 0 },
      { newStrikerId: "striker", newNonStrikerId: "non", idempotent: true },
    );
    expect(next).toBe(current);
  });
});

describe("rolesBeforeDelivery", () => {
  it("puts the undone ball's batter and bowler back at the crease", () => {
    const afterOver = rolesAfterDelivery({ ...base, runsBatsman: 0, legalBallsBefore: 5 });
    const restored = rolesBeforeDelivery(afterOver, {
      strikerId: "striker",
      nonStrikerId: "non",
      bowlerId: "bowler",
      extraType: null,
    });
    expect(restored.strikerId).toBe("striker");
    expect(restored.bowlerId).toBe("bowler");
    expect(restored.legalBallsInOver).toBe(5);
  });
});

describe("shouldQueueDeliveryFailure", () => {
  it("does not queue validation or conflict rejections", () => {
    expect(shouldQueueDeliveryFailure(400)).toBe(false);
    expect(shouldQueueDeliveryFailure(409)).toBe(false);
    expect(shouldQueueDeliveryFailure(422)).toBe(false);
  });

  it("queues network failures and server errors", () => {
    expect(shouldQueueDeliveryFailure(undefined)).toBe(true);
    expect(shouldQueueDeliveryFailure(500)).toBe(true);
    expect(shouldQueueDeliveryFailure(503)).toBe(true);
  });
});
