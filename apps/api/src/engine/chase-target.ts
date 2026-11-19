/**
 * Target stored on a new innings.
 *
 * A limited-overs chase (one innings per side, second innings) is the first
 * side's total plus one, unless DLS already published a revised target.
 * An explicit target from the caller wins. Multi-day innings are left unset.
 */
export function resolveChaseTarget(input: {
  nextInningsNumber: number;
  inningsPerSide: number;
  requestedTarget?: number | null;
  firstInningsRuns: number | null;
  revisedTarget?: number | null;
}): number | null {
  if (input.requestedTarget != null) return input.requestedTarget;
  if (input.inningsPerSide !== 1 || input.nextInningsNumber !== 2) return null;
  if (input.revisedTarget != null) return input.revisedTarget;
  if (input.firstInningsRuns == null) return null;
  return input.firstInningsRuns + 1;
}
