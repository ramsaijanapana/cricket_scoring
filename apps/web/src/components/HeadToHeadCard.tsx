import { useMemo } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HeadToHeadStats {
  balls: number;
  runs: number;
  dismissals: number;
  dotPct: number;
  boundaryPct: number;
  avgRunsPerBall: number;
}

interface HeadToHeadCardProps {
  batsmanName: string;
  bowlerName: string;
  stats: HeadToHeadStats;
}

// ─── Circular progress indicator ────────────────────────────────────────────

function CircularStat({
  value,
  max,
  label,
  displayValue,
  color,
}: {
  value: number;
  max: number;
  label: string;
  displayValue: string;
  color: string;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="68" height="68" viewBox="0 0 68 68" className="select-none">
        {/* Background ring */}
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth="5"
        />
        {/* Progress ring */}
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 34 34)"
          className="transition-all duration-500 ease-out"
        />
        {/* Center value */}
        <text
          x="34"
          y="36"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="13"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {displayValue}
        </text>
      </svg>
      <span className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ─── Stat bar ───────────────────────────────────────────────────────────────

function StatBar({
  label,
  value,
  max,
  displayValue,
  color,
}: {
  label: string;
  value: number;
  max: number;
  displayValue: string;
  color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-theme-secondary">{label}</span>
        <span className="text-[11px] font-bold text-theme-primary">{displayValue}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-500/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function HeadToHeadCard({ batsmanName, bowlerName, stats }: HeadToHeadCardProps) {
  const strikeRate = useMemo(
    () => (stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(1) : '0.0'),
    [stats.runs, stats.balls],
  );

  return (
    <div className="card p-5">
      {/* Header: batsman vs bowler */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-black text-theme-primary truncate">{batsmanName}</span>
        </div>
        <span className="text-[10px] font-bold text-theme-muted uppercase tracking-widest shrink-0 mx-2">
          vs
        </span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="text-sm font-black text-theme-primary truncate">{bowlerName}</span>
        </div>
      </div>

      {/* Circular indicators row */}
      <div className="flex items-start justify-around mb-5">
        <CircularStat
          value={stats.runs}
          max={Math.max(stats.runs, 50)}
          label="Runs"
          displayValue={String(stats.runs)}
          color="var(--color-blue, #3b82f6)"
        />
        <CircularStat
          value={stats.balls}
          max={Math.max(stats.balls, 30)}
          label="Balls"
          displayValue={String(stats.balls)}
          color="var(--color-green, #22c55e)"
        />
        <CircularStat
          value={stats.dismissals}
          max={Math.max(stats.dismissals, 5)}
          label="Dismissals"
          displayValue={String(stats.dismissals)}
          color="var(--color-red, #ef4444)"
        />
      </div>

      {/* Stat bars */}
      <div className="space-y-3">
        <StatBar
          label="Dot Ball %"
          value={stats.dotPct}
          max={100}
          displayValue={`${stats.dotPct.toFixed(1)}%`}
          color="var(--color-blue, #3b82f6)"
        />
        <StatBar
          label="Boundary %"
          value={stats.boundaryPct}
          max={100}
          displayValue={`${stats.boundaryPct.toFixed(1)}%`}
          color="var(--color-green, #22c55e)"
        />
        <StatBar
          label="Avg Runs/Ball"
          value={stats.avgRunsPerBall}
          max={3}
          displayValue={stats.avgRunsPerBall.toFixed(2)}
          color="#f59e0b"
        />
        <StatBar
          label="Strike Rate"
          value={parseFloat(strikeRate)}
          max={200}
          displayValue={strikeRate}
          color="var(--color-purple, #a855f7)"
        />
      </div>
    </div>
  );
}
