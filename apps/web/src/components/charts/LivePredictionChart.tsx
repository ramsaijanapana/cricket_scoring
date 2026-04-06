import { useMemo } from 'react';

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

interface LivePredictionChartProps {
  team1: TeamProbability;
  team2: TeamProbability;
  projectedScore?: ProjectedScore;
  currentScore?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_COLOR_1 = 'var(--color-blue, #3b82f6)';
const DEFAULT_COLOR_2 = 'var(--color-green, #22c55e)';
const BAR_HEIGHT = 36;
const GAUGE_HEIGHT = 12;

// ─── Component ──────────────────────────────────────────────────────────────

export function LivePredictionChart({
  team1,
  team2,
  projectedScore,
  currentScore,
}: LivePredictionChartProps) {
  const color1 = team1.color || DEFAULT_COLOR_1;
  const color2 = team2.color || DEFAULT_COLOR_2;

  // Normalise probabilities to ensure they sum to ~100
  const { pct1, pct2 } = useMemo(() => {
    const total = team1.probability + team2.probability;
    if (total === 0) return { pct1: 50, pct2: 50 };
    return {
      pct1: (team1.probability / total) * 100,
      pct2: (team2.probability / total) * 100,
    };
  }, [team1.probability, team2.probability]);

  // Score gauge marker position
  const gaugeMarkerPct = useMemo(() => {
    if (!projectedScore || currentScore == null) return null;
    const range = projectedScore.high - projectedScore.low;
    if (range <= 0) return 50;
    return Math.max(0, Math.min(100, ((currentScore - projectedScore.low) / range) * 100));
  }, [projectedScore, currentScore]);

  return (
    <div className="w-full space-y-5">
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
          {/* Gradient background behind both segments */}
          <div className="absolute inset-0 rounded-full bg-zinc-500/10" />

          {/* Team 1 segment */}
          <div
            className="absolute top-0 left-0 h-full rounded-l-full flex items-center justify-start pl-3"
            style={{
              width: `${pct1}%`,
              background: `linear-gradient(90deg, ${color1}, ${color1}dd)`,
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {pct1 > 15 && (
              <span className="text-white text-xs font-black tabular-nums">
                {pct1.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Team 2 segment */}
          <div
            className="absolute top-0 right-0 h-full rounded-r-full flex items-center justify-end pr-3"
            style={{
              width: `${pct2}%`,
              background: `linear-gradient(90deg, ${color2}dd, ${color2})`,
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {pct2 > 15 && (
              <span className="text-white text-xs font-black tabular-nums">
                {pct2.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Divider line */}
          <div
            className="absolute top-0 h-full w-[2px] bg-white/40"
            style={{
              left: `${pct1}%`,
              transition: 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>

        {/* Probability labels below (shown if percentage is too small for inline) */}
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

      {/* Projected Score Gauge */}
      {projectedScore && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-theme-muted uppercase tracking-widest">
              Projected Score Range
            </span>
          </div>

          <div className="relative">
            {/* Range bar */}
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

            {/* Mid marker */}
            <div
              className="absolute top-[-3px] w-[3px] rounded-full"
              style={{
                height: GAUGE_HEIGHT + 6,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--text-muted)',
                transition: 'left 0.4s ease-out',
              }}
            />

            {/* Current score marker */}
            {gaugeMarkerPct != null && (
              <div
                className="absolute top-[-5px]"
                style={{
                  left: `${gaugeMarkerPct}%`,
                  transform: 'translateX(-50%)',
                  transition: 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div
                  className="w-0 h-0"
                  style={{
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '7px solid var(--color-green, #22c55e)',
                  }}
                />
              </div>
            )}

            {/* Labels */}
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
