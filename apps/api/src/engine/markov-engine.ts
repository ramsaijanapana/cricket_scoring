/**
 * Markov Prediction Engine — next-over run distribution using Markov chains.
 *
 * Builds a transition matrix from the delivery history in the current match
 * to predict the probability distribution of outcomes in the next over.
 */

import { db } from '../db/index';
import { delivery } from '../db/schema/index';
import { eq, and, asc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Possible delivery outcome states */
export type DeliveryState = '0' | '1' | '2' | '3' | '4' | '6' | 'W' | 'E';

const ALL_STATES: DeliveryState[] = ['0', '1', '2', '3', '4', '6', 'W', 'E'];

export interface MarkovPrediction {
  expectedRuns: number;
  distribution: Record<string, number>;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINIMUM_DELIVERIES = 30;
const BALLS_PER_OVER = 6;

/**
 * Map a delivery record to a Markov state.
 */
function deliveryToState(d: {
  isWicket: boolean;
  extraType: string | null;
  runsBatsman: number;
}): DeliveryState {
  if (d.isWicket) return 'W';
  if (d.extraType) return 'E';

  switch (d.runsBatsman) {
    case 0: return '0';
    case 1: return '1';
    case 2: return '2';
    case 3: return '3';
    case 4: return '4';
    case 6: return '6';
    default:
      // 5 runs or other rare outcomes — map to nearest common state
      if (d.runsBatsman >= 5) return '6';
      return '0';
  }
}

/**
 * Return a uniform distribution across all states.
 */
function uniformDistribution(): Record<string, number> {
  const dist: Record<string, number> = {};
  const p = 1 / ALL_STATES.length;
  for (const state of ALL_STATES) {
    dist[state] = roundTo4(p);
  }
  return dist;
}

/**
 * Expected runs for a given state.
 */
function stateToExpectedRuns(state: DeliveryState): number {
  switch (state) {
    case '0': return 0;
    case '1': return 1;
    case '2': return 2;
    case '3': return 3;
    case '4': return 4;
    case '6': return 6;
    case 'W': return 0;
    case 'E': return 1; // extras average ~1 run
  }
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Build a transition matrix from a sequence of delivery states.
 *
 * transitionMatrix[fromState][toState] = probability of transitioning
 * from `fromState` to `toState`.
 */
function buildTransitionMatrix(
  states: DeliveryState[],
): Map<DeliveryState, Map<DeliveryState, number>> {
  const counts = new Map<DeliveryState, Map<DeliveryState, number>>();
  const totals = new Map<DeliveryState, number>();

  // Initialize
  for (const s of ALL_STATES) {
    counts.set(s, new Map<DeliveryState, number>());
    totals.set(s, 0);
  }

  // Count transitions
  for (let i = 0; i < states.length - 1; i++) {
    const from = states[i];
    const to = states[i + 1];
    const row = counts.get(from)!;
    row.set(to, (row.get(to) ?? 0) + 1);
    totals.set(from, (totals.get(from) ?? 0) + 1);
  }

  // Normalize to probabilities
  const matrix = new Map<DeliveryState, Map<DeliveryState, number>>();
  for (const from of ALL_STATES) {
    const row = counts.get(from)!;
    const total = totals.get(from) ?? 0;
    const probRow = new Map<DeliveryState, number>();

    if (total === 0) {
      // No data for this state — use uniform
      for (const to of ALL_STATES) {
        probRow.set(to, 1 / ALL_STATES.length);
      }
    } else {
      for (const to of ALL_STATES) {
        probRow.set(to, (row.get(to) ?? 0) / total);
      }
    }
    matrix.set(from, probRow);
  }

  return matrix;
}

/**
 * Given a transition matrix and the current state, compute the probability
 * distribution for the next delivery.
 */
function getNextDeliveryDistribution(
  matrix: Map<DeliveryState, Map<DeliveryState, number>>,
  currentState: DeliveryState,
): Record<string, number> {
  const row = matrix.get(currentState);
  if (!row) return uniformDistribution();

  const dist: Record<string, number> = {};
  for (const state of ALL_STATES) {
    dist[state] = roundTo4(row.get(state) ?? 0);
  }
  return dist;
}

/**
 * Simulate an over using the Markov chain to get expected runs and
 * aggregate distribution.
 */
function simulateOver(
  matrix: Map<DeliveryState, Map<DeliveryState, number>>,
  startState: DeliveryState,
  simulations: number = 1000,
): { expectedRuns: number; distribution: Record<string, number> } {
  const totalCounts: Record<string, number> = {};
  for (const s of ALL_STATES) totalCounts[s] = 0;

  let totalRuns = 0;

  for (let sim = 0; sim < simulations; sim++) {
    let currentState = startState;
    let overRuns = 0;

    for (let ball = 0; ball < BALLS_PER_OVER; ball++) {
      // Sample next state from distribution
      const row = matrix.get(currentState)!;
      const rand = Math.random();
      let cumulative = 0;
      let nextState: DeliveryState = '0';

      for (const state of ALL_STATES) {
        cumulative += row.get(state) ?? 0;
        if (rand <= cumulative) {
          nextState = state;
          break;
        }
      }

      totalCounts[nextState]++;
      overRuns += stateToExpectedRuns(nextState);
      currentState = nextState;
    }

    totalRuns += overRuns;
  }

  // Normalize distribution
  const totalBalls = simulations * BALLS_PER_OVER;
  const distribution: Record<string, number> = {};
  for (const s of ALL_STATES) {
    distribution[s] = roundTo4(totalCounts[s] / totalBalls);
  }

  return {
    expectedRuns: roundTo4(totalRuns / simulations),
    distribution,
  };
}

/**
 * Predict the next over's run distribution using a Markov chain model.
 *
 * Builds a transition matrix from all deliveries in the innings, then
 * uses Monte Carlo simulation to estimate the expected runs and outcome
 * distribution for the next over.
 *
 * Returns low confidence with uniform distribution if fewer than 30
 * deliveries have been bowled.
 */
export async function predictNextOver(
  matchId: string,
  inningsId: string,
): Promise<MarkovPrediction> {
  // Fetch all non-overridden deliveries for this innings
  const deliveries = await db
    .select({
      isWicket: delivery.isWicket,
      extraType: delivery.extraType,
      runsBatsman: delivery.runsBatsman,
      undoStackPos: delivery.undoStackPos,
    })
    .from(delivery)
    .where(
      and(
        eq(delivery.inningsId, inningsId),
        eq(delivery.matchId, matchId),
        eq(delivery.isOverridden, false),
      ),
    )
    .orderBy(asc(delivery.undoStackPos));

  // Insufficient data — return low confidence uniform distribution
  if (deliveries.length < MINIMUM_DELIVERIES) {
    const uniformDist = uniformDistribution();
    // Expected runs with uniform: (0+1+2+3+4+6+0+1)/8 * 6 balls = ~12.75
    const expectedPerBall =
      ALL_STATES.reduce((sum, s) => sum + stateToExpectedRuns(s), 0) / ALL_STATES.length;

    return {
      expectedRuns: roundTo4(expectedPerBall * BALLS_PER_OVER),
      distribution: uniformDist,
      confidence: 0,
    };
  }

  // Convert deliveries to state sequence
  const states: DeliveryState[] = deliveries.map(deliveryToState);

  // Build transition matrix
  const matrix = buildTransitionMatrix(states);

  // Current state = last delivery's state
  const currentState = states[states.length - 1];

  // Simulate next over
  const { expectedRuns, distribution } = simulateOver(matrix, currentState);

  // Confidence scales with data: 30 deliveries = 0.3, 60 = 0.6, 100+ = ~1.0
  const confidence = roundTo4(Math.min(1, deliveries.length / 100));

  return {
    expectedRuns,
    distribution,
    confidence,
  };
}
