import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { WormChartData } from '../../lib/api';

interface WormChartProps {
  data: WormChartData[];
  teamNames?: string[];
  dlsParLine?: { overs: number[]; runs: number[] };
}

const COLORS = ['var(--color-blue)', 'var(--color-green)', '#f59e0b', 'var(--color-purple)'];
const PADDING = { top: 24, right: 16, bottom: 40, left: 48 };

export function WormChart({ data, teamNames, dlsParLine }: WormChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const height = Math.min(width * 0.55, 360);
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const { maxOvers, maxRuns, xTicks, yTicks } = useMemo(() => {
    let mOvers = 0;
    let mRuns = 0;
    for (const d of data) {
      if (d.overs.length > 0) mOvers = Math.max(mOvers, Math.max(...d.overs));
      if (d.runs.length > 0) mRuns = Math.max(mRuns, Math.max(...d.runs));
    }
    if (dlsParLine) {
      if (dlsParLine.overs.length > 0) mOvers = Math.max(mOvers, Math.max(...dlsParLine.overs));
      if (dlsParLine.runs.length > 0) mRuns = Math.max(mRuns, Math.max(...dlsParLine.runs));
    }
    mOvers = mOvers || 20;
    mRuns = mRuns || 100;
    // Round up for nice ticks
    const runsStep = mRuns <= 50 ? 10 : mRuns <= 150 ? 25 : 50;
    mRuns = Math.ceil(mRuns / runsStep) * runsStep;
    const oversStep = mOvers <= 10 ? 2 : mOvers <= 25 ? 5 : 10;
    const xT: number[] = [];
    for (let i = 0; i <= mOvers; i += oversStep) xT.push(i);
    const yT: number[] = [];
    for (let i = 0; i <= mRuns; i += runsStep) yT.push(i);
    return { maxOvers: mOvers, maxRuns: mRuns, xTicks: xT, yTicks: yT };
  }, [data, dlsParLine]);

  const scaleX = useCallback((v: number) => PADDING.left + (v / maxOvers) * chartW, [maxOvers, chartW]);
  const scaleY = useCallback((v: number) => PADDING.top + chartH - (v / maxRuns) * chartH, [maxRuns, chartH]);

  const buildPath = useCallback((overs: number[], runs: number[]) => {
    if (overs.length === 0) return '';
    return overs.map((o, i) => `${i === 0 ? 'M' : 'L'}${scaleX(o).toFixed(1)},${scaleY(runs[i]).toFixed(1)}`).join(' ');
  }, [scaleX, scaleY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const overVal = ((mouseX - PADDING.left) / chartW) * maxOvers;
    if (overVal < 0 || overVal > maxOvers) { setTooltip(null); return; }

    const lines: string[] = [];
    for (let idx = 0; idx < data.length; idx++) {
      const d = data[idx];
      // Find closest over
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < d.overs.length; i++) {
        const dist = Math.abs(d.overs[i] - overVal);
        if (dist < minDist) { minDist = dist; closest = i; }
      }
      if (d.overs.length > 0) {
        const name = teamNames?.[idx] || `Innings ${d.inningsNum}`;
        lines.push(`${name}: ${d.runs[closest]} (${d.overs[closest]} ov)`);
      }
    }
    if (lines.length > 0) {
      setTooltip({ x: mouseX, y: e.clientY - rect.top - 12, text: lines.join(' | ') });
    }
  }, [data, teamNames, chartW, maxOvers]);

  if (data.length === 0) {
    return <EmptyState message="No worm chart data available" />;
  }

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        role="img"
        aria-label="Worm chart showing cumulative runs over overs"
      >
        {/* Grid lines */}
        {yTicks.map((t) => (
          <line
            key={`y-${t}`}
            x1={PADDING.left}
            y1={scaleY(t)}
            x2={width - PADDING.right}
            y2={scaleY(t)}
            stroke="var(--border-subtle)"
            strokeWidth="1"
          />
        ))}
        {xTicks.map((t) => (
          <line
            key={`x-${t}`}
            x1={scaleX(t)}
            y1={PADDING.top}
            x2={scaleX(t)}
            y2={PADDING.top + chartH}
            stroke="var(--border-subtle)"
            strokeWidth="1"
          />
        ))}

        {/* Axes */}
        <line x1={PADDING.left} y1={PADDING.top + chartH} x2={width - PADDING.right} y2={PADDING.top + chartH} stroke="var(--text-muted)" strokeWidth="1" />
        <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={PADDING.top + chartH} stroke="var(--text-muted)" strokeWidth="1" />

        {/* Tick labels */}
        {xTicks.map((t) => (
          <text key={`xl-${t}`} x={scaleX(t)} y={PADDING.top + chartH + 20} textAnchor="middle" className="chart-tick-label" fill="var(--text-tertiary)" fontSize="11">
            {t}
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`yl-${t}`} x={PADDING.left - 8} y={scaleY(t) + 4} textAnchor="end" className="chart-tick-label" fill="var(--text-tertiary)" fontSize="11">
            {t}
          </text>
        ))}

        {/* Axis labels */}
        <text x={PADDING.left + chartW / 2} y={height - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontWeight="600">
          Overs
        </text>
        <text x={12} y={PADDING.top + chartH / 2} textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontWeight="600" transform={`rotate(-90, 12, ${PADDING.top + chartH / 2})`}>
          Runs
        </text>

        {/* DLS par line */}
        {dlsParLine && dlsParLine.overs.length > 0 && (
          <path
            d={buildPath(dlsParLine.overs, dlsParLine.runs)}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            opacity="0.6"
          />
        )}

        {/* Innings lines */}
        {data.map((d, idx) => {
          const path = buildPath(d.overs, d.runs);
          if (!path) return null;
          const color = COLORS[idx % COLORS.length];
          return (
            <g key={idx}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={prefersReducedMotion ? {} : {
                  strokeDasharray: '2000',
                  strokeDashoffset: '2000',
                  animation: `worm-draw 1.2s ease-out ${idx * 0.3}s forwards`,
                }}
              />
              {/* End dot */}
              {d.overs.length > 0 && (
                <circle
                  cx={scaleX(d.overs[d.overs.length - 1])}
                  cy={scaleY(d.runs[d.runs.length - 1])}
                  r="4"
                  fill={color}
                  style={prefersReducedMotion ? {} : {
                    opacity: 0,
                    animation: `worm-dot 0.3s ease-out ${idx * 0.3 + 1}s forwards`,
                  }}
                />
              )}
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={Math.min(tooltip.x - 4, width - 200)}
              y={Math.max(tooltip.y - 24, 4)}
              width="auto"
              height="20"
              rx="4"
              fill="var(--bg-card)"
              stroke="var(--border-medium)"
              strokeWidth="1"
              style={{ pointerEvents: 'none' }}
            />
            <text
              x={Math.min(tooltip.x, width - 196)}
              y={Math.max(tooltip.y - 10, 18)}
              fill="var(--text-primary)"
              fontSize="11"
              fontWeight="500"
              style={{ pointerEvents: 'none' }}
            >
              {tooltip.text}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-2 text-xs">
        {data.map((d, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="w-3 h-[3px] rounded-full inline-block" style={{ background: COLORS[idx % COLORS.length] }} />
            <span className="text-theme-secondary">{teamNames?.[idx] || `Innings ${d.inningsNum}`}</span>
          </div>
        ))}
        {dlsParLine && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-[3px] rounded-full inline-block border-t border-dashed" style={{ borderColor: 'var(--text-muted)' }} />
            <span className="text-theme-tertiary">DLS Par</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes worm-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes worm-dot {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-theme-muted text-sm">
      {message}
    </div>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return prefersReducedMotion;
}
