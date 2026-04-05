import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { ManhattanBar } from '../../lib/api';

interface ManhattanChartProps {
  data: ManhattanBar[];
}

const PADDING = { top: 24, right: 16, bottom: 40, left: 48 };

export function ManhattanChart({ data }: ManhattanChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
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

  const height = Math.min(width * 0.5, 320);
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const { maxRuns, yTicks } = useMemo(() => {
    let mRuns = 0;
    for (const d of data) mRuns = Math.max(mRuns, d.runs);
    mRuns = mRuns || 12;
    const step = mRuns <= 12 ? 2 : mRuns <= 30 ? 5 : 10;
    mRuns = Math.ceil(mRuns / step) * step;
    const yT: number[] = [];
    for (let i = 0; i <= mRuns; i += step) yT.push(i);
    return { maxRuns: mRuns, yTicks: yT };
  }, [data]);

  const barCount = data.length || 1;
  const barGap = Math.max(1, Math.min(3, chartW / barCount * 0.15));
  const barWidth = Math.max(4, (chartW - barGap * (barCount - 1)) / barCount);

  const scaleY = useCallback((v: number) => PADDING.top + chartH - (v / maxRuns) * chartH, [maxRuns, chartH]);

  const xTicks = useMemo(() => {
    if (data.length <= 20) return data.map((d) => d.overNumber);
    const step = data.length <= 50 ? 5 : 10;
    return data.filter((d) => d.overNumber % step === 0).map((d) => d.overNumber);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-theme-muted text-sm">
        No manhattan data available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="select-none"
        role="img"
        aria-label="Manhattan chart showing runs scored per over"
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

        {/* Axes */}
        <line x1={PADDING.left} y1={PADDING.top + chartH} x2={width - PADDING.right} y2={PADDING.top + chartH} stroke="var(--text-muted)" strokeWidth="1" />
        <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={PADDING.top + chartH} stroke="var(--text-muted)" strokeWidth="1" />

        {/* Y-axis labels */}
        {yTicks.map((t) => (
          <text key={`yl-${t}`} x={PADDING.left - 8} y={scaleY(t) + 4} textAnchor="end" fill="var(--text-tertiary)" fontSize="11">
            {t}
          </text>
        ))}

        {/* Bars */}
        {data.map((d, idx) => {
          const x = PADDING.left + idx * (barWidth + barGap);
          const barH = (d.runs / maxRuns) * chartH;
          const y = PADDING.top + chartH - barH;
          const isHovered = hoveredBar === idx;

          return (
            <g
              key={d.overNumber}
              onMouseEnter={() => setHoveredBar(idx)}
              onMouseLeave={() => setHoveredBar(null)}
              style={{ cursor: 'default' }}
            >
              {/* Bar body */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(0, barH)}
                rx={Math.min(3, barWidth / 4)}
                fill="var(--color-blue)"
                opacity={isHovered ? 1 : 0.75}
                style={prefersReducedMotion ? {} : {
                  transform: `scaleY(1)`,
                  transformOrigin: `${x + barWidth / 2}px ${PADDING.top + chartH}px`,
                  animation: `manhattan-grow 0.5s ease-out ${idx * 0.02}s both`,
                }}
              />

              {/* Wicket marker (red dot above bar) */}
              {d.wickets > 0 && (
                <g>
                  {Array.from({ length: d.wickets }).map((_, wIdx) => (
                    <circle
                      key={wIdx}
                      cx={x + barWidth / 2}
                      cy={y - 6 - wIdx * 10}
                      r={4}
                      fill="var(--color-red)"
                      stroke="var(--bg-card)"
                      strokeWidth="1.5"
                    />
                  ))}
                </g>
              )}

              {/* Hover tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={Math.min(x - 20, width - 100)}
                    y={Math.max(y - 38, 2)}
                    width="80"
                    height="28"
                    rx="6"
                    fill="var(--bg-card)"
                    stroke="var(--border-medium)"
                    strokeWidth="1"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                  />
                  <text
                    x={Math.min(x - 20 + 40, width - 60)}
                    y={Math.max(y - 20, 16)}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize="11"
                    fontWeight="600"
                  >
                    Ov {d.overNumber}: {d.runs}r {d.wickets > 0 ? `${d.wickets}w` : ''}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* X-axis tick labels */}
        {xTicks.map((overNum) => {
          const idx = data.findIndex((d) => d.overNumber === overNum);
          if (idx === -1) return null;
          const x = PADDING.left + idx * (barWidth + barGap) + barWidth / 2;
          return (
            <text key={`xl-${overNum}`} x={x} y={PADDING.top + chartH + 20} textAnchor="middle" fill="var(--text-tertiary)" fontSize="11">
              {overNum}
            </text>
          );
        })}

        {/* Axis labels */}
        <text x={PADDING.left + chartW / 2} y={height - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontWeight="600">
          Over
        </text>
        <text x={12} y={PADDING.top + chartH / 2} textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontWeight="600" transform={`rotate(-90, 12, ${PADDING.top + chartH / 2})`}>
          Runs
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--color-blue)', opacity: 0.75 }} />
          <span className="text-theme-secondary">Runs per over</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'var(--color-red)' }} />
          <span className="text-theme-secondary">Wicket</span>
        </div>
      </div>

      <style>{`
        @keyframes manhattan-grow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
      `}</style>
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
