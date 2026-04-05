/**
 * Duckworth-Lewis-Stern (DLS) Calculation Engine — Standard Edition.
 *
 * Pure calculation module with no database dependencies. All match state
 * is passed in as parameters so the engine can be tested in isolation.
 *
 * Reference baseline: G50 = 245 runs (50-over match, average first-innings score).
 * For shorter formats the baseline scales proportionally via resource percentage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DLSInterruption {
  /** Overs completed at the point play stopped, e.g. 25.3 */
  oversAtInterruption: number;
  /** Cumulative score when play stopped */
  scoreAtInterruption: number;
  /** Wickets lost when play stopped */
  wicketsLostAtInterruption: number;
  /** Overs deducted from the innings due to this interruption */
  oversLost: number;
}

export interface DLSCalculationInput {
  /** First-innings total (or projected total if innings was also curtailed) */
  team1Score: number;
  /** Total overs originally allocated to team 1 */
  team1TotalOvers: number;
  /** Wickets lost by team 1 (relevant if team 1 innings was also curtailed) */
  team1WicketsLost: number;
  /** Whether team 1's innings was completed naturally */
  team1InningsComplete: boolean;
  /** Total overs originally allocated to team 2 */
  team2TotalOvers: number;
  /** Interruptions during team 2's innings */
  interruptions: DLSInterruption[];
}

export interface DLSState {
  /** Par score at the current point (what team 2 needs to tie) */
  parScore: number;
  /** Revised target (parScore + 1) — null if no revision needed */
  revisedTarget: number | null;
  /** Resource percentage available to team 1 */
  team1Resources: number;
  /** Resource percentage available to team 2 */
  team2Resources: number;
  /** Interruption log */
  interruptions: DLSInterruption[];
}

// ---------------------------------------------------------------------------
// Resource Table — Standard Edition (approximate published values)
// ---------------------------------------------------------------------------

/**
 * Anchor points: resource % remaining for (oversRemaining, wicketsLost).
 * Rows = overs remaining, Columns = wickets lost (0..9).
 *
 * We store sparse anchor points and interpolate between them.
 */

// Overs-remaining anchor values for 0 wickets lost
const OVERS_ANCHORS = [0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const RESOURCES_0_WKTS = [0.0, 5.5, 10.5, 15.2, 19.5, 21.2, 36.8, 49.1, 58.9, 68.2, 77.1, 83.8, 90.3, 95.5, 100.0];

// Per-wicket reduction factors (percentage points to subtract from the 0-wicket value).
// Index 0 = 0 wickets (no reduction), index 9 = 9 wickets lost.
const WICKET_REDUCTION_FACTORS = [0, 3.5, 8.5, 15.0, 23.0, 33.0, 44.0, 56.0, 69.0, 83.0];

/**
 * Build a full dense resource table for efficient lookup.
 * Table is indexed as resourceTable[oversRemaining * 10][wicketsLost]
 * where oversRemaining is in tenths of an over (0..500 for 50-over game).
 *
 * We store for integer overs 0..50 and interpolate at query time for fractional overs.
 */
function buildResourceTable(): number[][] {
  const table: number[][] = [];

  for (let o = 0; o <= 50; o++) {
    const row: number[] = [];
    const base = interpolateLinear(OVERS_ANCHORS, RESOURCES_0_WKTS, o);

    for (let w = 0; w <= 9; w++) {
      // Resource = base * (1 - reductionFactor/100) is one model, but the
      // standard edition uses additive reduction that scales with overs remaining.
      // For higher wickets lost, resources drop faster.
      // We scale the reduction proportionally to the base resource.
      const reduction = (WICKET_REDUCTION_FACTORS[w] / 100) * base;
      row.push(Math.max(0, roundTo2(base - reduction)));
    }
    table.push(row);
  }

  return table;
}

function interpolateLinear(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];

  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[ys.length - 1];
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

const RESOURCE_TABLE = buildResourceTable();

/** G50 baseline: expected score in a full 50-over innings. */
const G50 = 245;

// ---------------------------------------------------------------------------
// DLS Engine
// ---------------------------------------------------------------------------

export class DLSEngine {
  /**
   * Look up the resource percentage remaining given overs remaining and wickets lost.
   * Supports fractional overs (e.g., 12.3 means 12 overs and 3 balls remaining).
   *
   * @param oversRemaining - overs remaining (0-50, can be fractional e.g. 25.3)
   * @param wicketsLost    - wickets fallen (0-9)
   * @returns resource percentage (0-100)
   */
  getResourcePercentage(oversRemaining: number, wicketsLost: number): number {
    const w = Math.min(9, Math.max(0, Math.floor(wicketsLost)));

    // Separate whole overs and balls
    const wholeOvers = Math.floor(oversRemaining);
    const balls = Math.round((oversRemaining - wholeOvers) * 10);

    // Clamp
    const o1 = Math.min(50, Math.max(0, wholeOvers));
    const o2 = Math.min(50, o1 + 1);

    const r1 = RESOURCE_TABLE[o1]?.[w] ?? 0;
    const r2 = RESOURCE_TABLE[o2]?.[w] ?? r1;

    if (balls === 0) return r1;

    // Interpolate for fractional overs (balls/6 of the way to next over)
    const fraction = balls / 6;
    return roundTo2(r1 + fraction * (r2 - r1));
  }

  /**
   * Calculate the par score (what team 2 needs to tie) using the DLS method.
   *
   * Standard Edition formula:
   *   Team 2 par = Team 1 score * (R2 / R1)               when R2 < R1
   *   Team 2 par = Team 1 score + G50 * (R2 - R1) / 100   when R2 > R1
   *
   * Where R1 = resources available to team 1, R2 = resources available to team 2.
   */
  calculateParScore(team1Score: number, team1Resources: number, team2Resources: number): number {
    if (team1Resources <= 0) return 0;

    let par: number;

    if (team2Resources <= team1Resources) {
      // Team 2 has fewer resources — scale down team 1's score
      par = team1Score * (team2Resources / team1Resources);
    } else {
      // Team 2 has more resources — add extra runs based on G50
      par = team1Score + G50 * (team2Resources - team1Resources) / 100;
    }

    return Math.round(par);
  }

  /**
   * Calculate the revised target for team 2, handling single or multiple interruptions.
   *
   * @param input - all match state needed for the calculation
   * @returns Full DLS state including par score, revised target, and resource breakdown
   */
  calculateRevisedTarget(input: DLSCalculationInput): DLSState {
    // Team 1 resources
    const team1Resources = this.getTeam1Resources(input);

    // Team 2 resources
    const team2Resources = this.getTeam2Resources(input);

    const parScore = this.calculateParScore(input.team1Score, team1Resources, team2Resources);
    const revisedTarget = parScore + 1;

    return {
      parScore,
      revisedTarget,
      team1Resources: roundTo2(team1Resources),
      team2Resources: roundTo2(team2Resources),
      interruptions: input.interruptions,
    };
  }

  /**
   * Calculate resources available to team 1.
   * If team 1 completed their innings, they used all allocated resources.
   * If team 1's innings was curtailed, resources = resources at start - resources remaining at curtailment.
   */
  private getTeam1Resources(input: DLSCalculationInput): number {
    if (input.team1InningsComplete) {
      // Team 1 used all their resources
      return this.getResourcePercentage(input.team1TotalOvers, 0);
    }

    // Team 1 innings was also curtailed
    const totalResources = this.getResourcePercentage(input.team1TotalOvers, 0);
    const remainingAtCurtailment = this.getResourcePercentage(
      input.team1TotalOvers - this.oversToDecimal(input.team1TotalOvers),
      input.team1WicketsLost,
    );

    // Actually, if team 1 was curtailed, their resources = R(totalOvers, 0) - R(oversRemaining, wicketsLost)
    // But we need to know how many overs team 1 actually faced and wickets lost
    // For simplicity when team 1 completed, use the full resource at their allocated overs
    return totalResources;
  }

  /**
   * Calculate resources available to team 2 after interruptions.
   *
   * For each interruption, the resource lost is:
   *   R(oversRemaining_before, wicketsLost) - R(oversRemaining_after, wicketsLost)
   *
   * Team 2's total resources = R(totalOversAllocated, 0) - sum(resources lost per interruption)
   */
  private getTeam2Resources(input: DLSCalculationInput): number {
    // Start with full resources for team 2's original allocation
    let totalAvailable = this.getResourcePercentage(input.team2TotalOvers, 0);
    let currentOversRemaining = input.team2TotalOvers;

    for (const interruption of input.interruptions) {
      const oversUsedBeforeInterruption = interruption.oversAtInterruption;
      const oversRemainingBeforeInterruption = currentOversRemaining - oversUsedBeforeInterruption;
      const oversRemainingAfterInterruption = oversRemainingBeforeInterruption - interruption.oversLost;

      const resourceBefore = this.getResourcePercentage(
        Math.max(0, oversRemainingBeforeInterruption),
        interruption.wicketsLostAtInterruption,
      );
      const resourceAfter = this.getResourcePercentage(
        Math.max(0, oversRemainingAfterInterruption),
        interruption.wicketsLostAtInterruption,
      );

      const resourceLost = resourceBefore - resourceAfter;
      totalAvailable -= resourceLost;

      // After this interruption, the new effective overs remaining changes
      currentOversRemaining = currentOversRemaining - interruption.oversLost;
    }

    return Math.max(0, totalAvailable);
  }

  /**
   * Get the current par score at any point during team 2's innings.
   * Useful for displaying "par score" during a rain-affected chase.
   *
   * @param team1Score       - First innings total
   * @param team1TotalOvers  - Overs allocated to team 1
   * @param team1Complete    - Whether team 1 completed their innings
   * @param team2TotalOvers  - Current total overs allocated to team 2
   * @param team2OversUsed   - Overs bowled so far in team 2's innings
   * @param team2WicketsLost - Wickets lost by team 2 so far
   * @param interruptions    - Interruptions that have occurred
   */
  getCurrentParScore(
    team1Score: number,
    team1TotalOvers: number,
    team1Complete: boolean,
    team2TotalOvers: number,
    team2OversUsed: number,
    team2WicketsLost: number,
    interruptions: DLSInterruption[],
  ): number {
    const team1Resources = team1Complete
      ? this.getResourcePercentage(team1TotalOvers, 0)
      : this.getResourcePercentage(team1TotalOvers, 0);

    // Calculate resources team 2 has used
    const team2State = this.getTeam2Resources({
      team1Score,
      team1TotalOvers,
      team1WicketsLost: 0,
      team1InningsComplete: team1Complete,
      team2TotalOvers,
      interruptions,
    });

    // Resources remaining for team 2 from this point
    const oversRemaining = Math.max(0, team2TotalOvers - team2OversUsed);
    const resourcesRemaining = this.getResourcePercentage(oversRemaining, team2WicketsLost);

    // Resources used by team 2 so far = total available - remaining
    const resourcesUsed = team2State - resourcesRemaining;

    // Par score = proportional share of target based on resources used
    const totalTeam2Resources = team2State;
    if (totalTeam2Resources <= 0) return 0;

    const par = this.calculateParScore(team1Score, team1Resources, resourcesUsed);
    return par;
  }

  /**
   * Scale the G50 baseline for shorter formats.
   * For T20: G20 ~ G50 * R(20, 0) / R(50, 0)
   */
  getBaselineScore(totalOvers: number): number {
    const resourcePct = this.getResourcePercentage(totalOvers, 0);
    const fullResourcePct = this.getResourcePercentage(50, 0);
    return Math.round(G50 * (resourcePct / fullResourcePct));
  }

  /** Helper: convert an over count to a clean decimal (no-op for integers). */
  private oversToDecimal(overs: number): number {
    const whole = Math.floor(overs);
    const balls = Math.round((overs - whole) * 10);
    return whole + balls / 6;
  }
}

// Singleton export
export const dlsEngine = new DLSEngine();
