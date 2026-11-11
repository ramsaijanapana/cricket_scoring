import { describe, expect, it } from "vitest";
import {
  chooseStrike,
  predictStrikeAfterDelivery,
  strikeFromEnds,
} from "./strike";

const A = "batsman-a";
const B = "batsman-b";
const pair = { strikerId: A, nonStrikerId: B };

describe("strike ends", () => {
  it("keeps a server pair of two different players", () => {
    expect(strikeFromEnds(B, A)).toEqual({ strikerId: B, nonStrikerId: A });
  });

  it("drops a pair that still needs a new batsman", () => {
    expect(strikeFromEnds("PENDING_NEW_BATSMAN", B)).toBeNull();
  });

  it("prefers remembered ends over the balls-faced fallback", () => {
    const notOut = new Set([A, B]);
    expect(
      chooseStrike(pair, { strikerId: B, nonStrikerId: A }, notOut),
    ).toEqual(pair);
  });

  it("falls back when a remembered batter is out", () => {
    const fallback = { strikerId: B, nonStrikerId: "batsman-c" };
    expect(chooseStrike(pair, fallback, new Set([B, "batsman-c"]))).toEqual(fallback);
  });

  it("sends the non-striker to face after one bye", () => {
    expect(
      predictStrikeAfterDelivery(
        pair,
        { runs_batsman: 0, runs_extras: 1, extra_type: "bye" },
        "0.1",
      ),
    ).toEqual({ strikerId: B, nonStrikerId: A });
  });

  it("sends the non-striker to face after a single", () => {
    expect(
      predictStrikeAfterDelivery(
        pair,
        { runs_batsman: 1, runs_extras: 0, extra_type: null },
        "2.3",
      ),
    ).toEqual({ strikerId: B, nonStrikerId: A });
  });

  it("does not cross on a plain wide", () => {
    expect(
      predictStrikeAfterDelivery(
        pair,
        { runs_batsman: 0, runs_extras: 1, extra_type: "wide" },
        "2.3",
      ),
    ).toEqual(pair);
  });

  it("crosses and changes ends on a single that finishes the over", () => {
    expect(
      predictStrikeAfterDelivery(
        pair,
        { runs_batsman: 1, runs_extras: 0, extra_type: null },
        "0.5",
      ),
    ).toEqual(pair);
  });
});
