import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Gauge, Trophy, Zap } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamProbability {
  name: string;
  probability: number;
  color?: string;
}

interface ProjectedScore {
  low: number;
  mid: number;
  high: number;
}

interface MilestoneToast {
  text: string;
  type: 'fifty' | 'hundred' | 'pressure';
}

interface LivePredictionChartProps {
  team1: TeamProbability;
  team2: TeamProbability;
  projectedScore?: ProjectedScore;
  currentScore?: number;
  currentRunRate?: number;
  requiredRunRate?: number | null;
  reduceMotion?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_COLOR_1 = 'var(--color-blue, #3b82f6)';
const DEFAULT_COLOR_2 = 'var(--color-green, #22c55e)';
const BAR_HEIGHT = 36;
const GAUGE_HEIGHT = 12;
const RRR_GAUGE_MAX = 20;

const springTransition = { type: 'spring' as const, stiffness: 120, damping: 22 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function rateGaugePct(rate: number, max: number): number {
  return Math.max(0, Math.min(100, (rate / max) * 100));
}

function pressureLevel(crr: number, rrr: number): 'ahead' | 'close' | 'pressure' | 'critical' {
  if (rrr <= crr * 0.85) return 'ahead';
  if (rrr <= crr) return 'close';
  if (rrr <= crr * 1.5) return 'pressure';
  return 'critical';
}

const PRESSURE_COLORS: Record<ReturnType<typeof pressureLevel>, string> = {
  ahead: 'var(--color-green, #22c55e)',
  close: 'var(--color-amber, #f59e0b)',
  pressure: 'var(--color-orange, #f97316)',
  critical: 'var(--color-red, #ef4444)',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function LivePredictionChart({
  team1,
  team2,
  projectedScore,
  currentScore,
  currentRunRate,
  requiredRunRate,
  reduceMotion: reduceMotionProp,
}: LivePredictionChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = reduceMotionProp ?? !!prefersReducedMotion;

  const color1 = team1.color || DEFAULT_COLOR_1;
  const color2 = team2.color || DEFAULT_COLOR_2;

  const [milestoneToast, setMilestoneToast] = useState<MilestoneToast | null>(null);
  const prevScoreRef = useRef(currentScore ?? 0);
  const shownMilestonesRef = useRef<Set<string>>(new Set());
  const prevProbRef = useRef(team2.probability);

  // Normalise probabilities to ensure they sum to ~100
  const { pct1, pct2 } = useMemo(() => {
    const total = team1.probability + team2.probability;
    if (total === 0) return { pct1: 50, pct2: 50 };
    return {
      pct1: (team1.probability / total) * 100,
      pct2: (team2.probability / total) * 100,
    };
  }, [team1.probability, team2.probability]);

  const probShift = Math.abs(team2.probability - prevProbRef.current);
  useEffect(() => {
    prevProbRef.current = team2.probability;
  }, [team2.probability]);

  // Score gauge marker position
  const gaugeMarkerPct = useMemo(() => {
    if (!projectedScore || currentScore == null) return null;
    const range = projectedScore.high - projectedScore.low;
    if (range <= 0) return 50;
    return Math.max(0, Math.min(100, ((currentScore - projectedScore.low) / range) * 100));
  }, [projectedScore, currentScore]);

  const crr = currentRunRate ?? 0;
  const rrr = requiredRunRate ?? null;
  const showRrrGauge = rrr != null && crr >= 0;

  const rrrGaugeMax = useMemo(() => {
    if (!showRrrGauge) return RRR_GAUGE_MAX;
    return Math.max(RRR_GAUGE_MAX, Math.ceil(Math.max(crr, rrr!) * 1.25));
  }, [showRrrGauge, crr, rrr]);

  const crrPct = rateGaugePct(crr, rrrGaugeMax);
  const rrrPct = rrr != null ? rateGaugePct(rrr, rrrGaugeMax) : 0;
  const chasePressure = showRrrGauge ? pressureLevel(crr, rrr!) : null;

  // Milestone toasts: team 50, team 100, chase pressure
  useEffect(() => {
    const score = currentScore ?? 0;
    const prev = prevScoreRef.current;

    if (prev < 50 && score >= 50 && !shownMilestonesRef.current.has('team-50')) {
      shownMilestonesRef.current.add('team-50');
      setMilestoneToast({ text: 'Team fifty!', type: 'fifty' });
    } else if (prev < 100 && score >= 100 && !shownMilestonesRef.current.has('team-100')) {
      shownMilestonesRef.current.add('team-100');
      setMilestoneToast({ text: 'Team century!', type: 'hundred' });
    } else if (
      showRrrGauge &&
      rrr! > crr &&
      !shownMilestonesRef.current.has('chase-pressure')
    ) {
      shownMilestonesRef.current.add('chase-pressure');
      setMilestoneToast({
        text: `Chase pressure — need ${rrr!.toFixed(2)} RPO`,
        type: 'pressure',
      });
    }

    prevScoreRef.current = score;
  }, [currentScore, showRrrGauge, crr, rrr]);

  useEffect(() => {
    if (!milestoneToast) return;
    const timer = setTimeout(() => setMilestoneToast(null), 4000);
    return () => clearTimeout(timer);
  }, [milestoneToast]);

  const barTransition = reduceMotion ? { duration: 0 } : springTransition;

  return (
    <div className="w-full space-y-5 relative">
      {/* Milestone toast overlay */}
      <AnimatePresence>
        {milestoneToast && (
          <motion.div
            className="absolute -top-2 left-1/2 z-10 w-full max-w-xs"
            style={{ x: '-50%' }}
            initial={reduceMotion ? { opacity: 0 } : { y: -20, opacity: 0, scale: 0.9 }}
            animate={reduceMotion ? { opacity: 1 } : { y: -28, opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: -20, opacity: 0, scale: 0.9 }}
            transition={reduceMotion ? { duration: 0.15 } : springTransition}
            role="status"
            aria-live="polite"
          >
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border backdrop-blur-sm text-xs font-semibold ${
                milestoneToast.type === 'pressure'
                  ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                  : 'bg-cricket-gold/15 border-cricket-gold/40 text-cricket-gold'
              }`}
            >
              {milestoneToast.type === 'pressure' ? (
                <Zap size={14} className="shrink-0" />
              ) : (
                <Trophy size={14} className="shrink-0" />
              )}
              {milestoneToast.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Win Probability Bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-theme-primary truncate max-w-[40%]">
            {team1.name}
          </span>
          <span className="text-[10px] font-bold text-theme-muted uppercase tracking-widest">
            Win Probability
          </span>
          <span className="text-xs font-bold text-theme-primary truncate max-w-[40%] text-right">
            {team2.name}
          </span>
        </div>

        <div
          className="relative w-full rounded-full overflow-hidden"
          style={{ height: BAR_HEIGHT }}
        >
          <div className="absolute inset-0 rounded-full bg-zinc-500/10" />

          <motion.div
            className="absolute top-0 left-0 h-full rounded-l-full flex items-center justify-start pl-3"
            animate={{ width: `${pct1}%` }}
            transition={barTransition}
            style={{
              background: `linear-gradient(90deg, ${color1}, ${color1}dd)`,
              willChange: reduceMotion ? undefined : 'width',
            }}
          >
            {pct1 > 15 && (
              <motion.span
                key={pct1.toFixed(1)}
                className="text-white text-xs font-black tabular-nums"
                initial={reduceMotion ? undefined : { opacity: 0.6, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
              >
                {pct1.toFixed(1)}%
              </motion.span>
            )}
          </motion.div>

          <motion.div
            className="absolute top-0 right-0 h-full rounded-r-full flex items-center justify-end pr-3"
            animate={{ width: `${pct2}%` }}
            transition={barTransition}
            style={{
              background: `linear-gradient(90deg, ${color2}dd, ${color2})`,
              willChange: reduceMotion ? undefined : 'width',
            }}
          >
            {pct2 > 15 && (
              <motion.span
                key={pct2.toFixed(1)}
                className="text-white text-xs font-black tabular-nums"
                initial={reduceMotion ? undefined : { opacity: 0.6, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
              >
                {pct2.toFixed(1)}%
              </motion.span>
            )}
          </motion.div>

          <motion.div
            className="absolute top-0 h-full w-[2px] bg-white/40"
            animate={{ left: `${pct1}%` }}
            transition={barTransition}
          />

          {!reduceMotion && probShift >= 5 && (
            <motion.div
              className="absolute top-0 h-full w-[3px] rounded-full pointer-events-none"
              style={{
                left: `${pct1}%`,
                background: 'rgba(255,255,255,0.7)',
                boxShadow: '0 0 8px rgba(255,255,255,0.5)',
              }}
              initial={{ opacity: 1, scaleY: 1.2 }}
              animate={{ opacity: 0, scaleY: 1 }}
              transition={{ duration: 0.8 }}
            />
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          {pct1 <= 15 && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: color1 }}>
              {pct1.toFixed(1)}%
            </span>
          )}
          {pct1 > 15 && <span />}
          {pct2 <= 15 && (
            <span className="text-[11px] font-bold tabular-nums text-right" style={{ color: color2 }}>
              {pct2.toFixed(1)}%
            </span>
          )}
          {pct2 > 15 && <span />}
        </div>
      </div>

      {/* Required Run Rate Gauge */}
      {showRrrGauge && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-theme-muted uppercase tracking-widest flex items-center gap-1.5">
              <Gauge size={12} />
              Run Rate Gauge
            </span>
            {chasePressure && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: PRESSURE_COLORS[chasePressure] }}
              >
                {chasePressure === 'ahead'
                  ? 'Ahead'
                  : chasePressure === 'close'
                    ? 'On track'
                    : chasePressure === 'pressure'
                      ? 'Pressure'
                      : 'Critical'}
              </span>
            )}
          </div>

          <div className="relative">
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ height: GAUGE_HEIGHT }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg,
                    var(--color-green, #22c55e)40 0%,
                    var(--color-amber, #f59e0b)60 50%,
                    var(--color-red, #ef4444)80 100%)`,
                }}
              />
            </div>

            <motion.div
              className="absolute top-[-4px]"
              animate={{ left: `${crrPct}%` }}
              transition={barTransition}
              style={{ transform: 'translateX(-50%)' }}
              aria-hidden
            >
              <div
                className="w-[3px] rounded-full"
                style={{
                  height: GAUGE_HEIGHT + 8,
                  background: color1,
                }}
              />
            </motion.div>

            <motion.div
              className="absolute top-[-6px]"
              animate={{ left: `${rrrPct}%` }}
              transition={barTransition}
              style={{ transform: 'translateX(-50%)' }}
              aria-hidden
            >
              <div
                className="w-0 h-0"
                style={{
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: `7px solid ${chasePressure ? PRESSURE_COLORS[chasePressure] : 'var(--color-amber, #f59e0b)'}`,
                }}
              />
            </motion.div>

            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] font-semibold text-theme-muted tabular-nums">0</span>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: color1 }}>
                  CRR {crr.toFixed(2)}
                </span>
                <span
                  className="text-[10px] font-bold tabular-nums"
                  style={{ color: chasePressure ? PRESSURE_COLORS[chasePressure] : 'var(--color-amber)' }}
                >
                  RRR {rrr!.toFixed(2)}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-theme-muted tabular-nums">
                {rrrGaugeMax}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Projected Score Gauge */}
      {projectedScore && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-theme-muted uppercase tracking-widest">
              Projected Score Range
            </span>
          </div>

          <div className="relative">
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ height: GAUGE_HEIGHT }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${color1}40, ${color1}90, ${color1}40)`,
                }}
              />
            </div>

            <div
              className="absolute top-[-3px] w-[3px] rounded-full"
              style={{
                height: GAUGE_HEIGHT + 6,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--text-muted)',
              }}
            />

            {gaugeMarkerPct != null && (
              <motion.div
                className="absolute top-[-5px]"
                animate={{ left: `${gaugeMarkerPct}%` }}
                transition={barTransition}
                style={{ transform: 'translateX(-50%)' }}
              >
                <div
                  className="w-0 h-0"
                  style={{
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '7px solid var(--color-green, #22c55e)',
                  }}
                />
              </motion.div>
            )}

            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] font-semibold text-theme-muted tabular-nums">
                {projectedScore.low}
              </span>
              <span className="text-[11px] font-bold text-theme-primary tabular-nums">
                {projectedScore.mid}
              </span>
              <span className="text-[10px] font-semibold text-theme-muted tabular-nums">
                {projectedScore.high}
              </span>
            </div>
          </div>

          {currentScore != null && (
            <div className="text-center mt-1">
              <span className="text-[10px] text-theme-tertiary">
                Current: <span className="font-bold text-theme-primary">{currentScore}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Exported for unit tests
export { rateGaugePct, pressureLevel, PRESSURE_COLORS };
