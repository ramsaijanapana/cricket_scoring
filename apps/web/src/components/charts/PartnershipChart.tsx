import { useMemo, useRef, useEffect, useState, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PartnershipData {
  batsman1Id: string;
  batsman1Name?: string;
  batsman2Id: string;
  batsman2Name?: string;
  runs: number;
  balls: number;
  batsman1Runs?: number;
  batsman2Runs?: number;
  isUnbroken?: boolean;
}

interface PartnershipChartProps {
  data: PartnershipData[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PADDING = { top: 24, right: 80, bottom: 16, left: 56 };
const BAR_HEIGHT = 28;
const BAR_GAP = 16;
const COLOR_1 = 'var(--color-blue, #3b82f6)';
const COLOR_2 = 'var(--color-green, #22c55e)';

// ─── Helpers ────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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

// ─── Component ──────────────────────────────────────────────────────────────

export function PartnershipChart({ data }: PartnershipChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
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

  const chartW = width - PADDING.left - PADDING.right;
  const contentH = data.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;
  const height = PADDING.top + contentH + PADDING.bottom;

  const maxRuns = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.runs);
    return m || 1;
  }, [data]);

  const scaleX = useCallback(
    (runs: number) => Math.max(0, (runs / maxRuns) * chartW),
    [maxRuns, chartW],
  );

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-theme-muted text-sm">
        No partnership data available
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
        aria-label="Partnership chart showing run contributions per partnership"
      >
        {data.map((p, idx) => {
          const y = PADDING.top + idx * (BAR_HEIGHT + BAR_GAP);
          const totalBarW = scaleX(p.runs);
          const b1Runs = p.batsman1Runs ?? Math.round(p.runs / 2);
          const b2Runs = p.batsman2Runs ?? p.runs - b1Runs;
          const b1W = p.runs > 0 ? scaleX(b1Runs) : 0;
          const b2W = totalBarW - b1W;
          const isHovered = hoveredIdx === idx;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'default' }}
            >
              {/* Partnership number label */}
              <text
                x={PADDING.left - 8}
                y={y + BAR_HEIGHT / 2 + 1}
                textAnchor="end"
                dominantBaseline="central"
                fontSize="11"
                fontWeight="600"
                fill="var(--text-secondary)"
              >
                {ordinal(idx + 1)}
              </text>

              {/* Batsman 1 bar segment */}
              <rect
                x={PADDING.left}
                y={y}
                width={Math.max(0, b1W)}
                height={BAR_HEIGHT}
                rx={4}
                fill={COLOR_1}
                opacity={isHovered ? 1 : 0.8}
                stroke={p.isUnbroken ? 'var(--text-primary)' : 'none'}
                strokeWidth={p.isUnbroken ? 1.5 : 0}
                strokeDasharray={p.isUnbroken ? '5 3' : 'none'}
                style={
                  prefersReducedMotion
                    ? {}
                    : {
                        transform: 'scaleX(1)',
                        transformOrigin: `${PADDING.left}px ${y + BAR_HEIGHT / 2}px`,
                        animation: `partnership-grow 0.5s ease-out ${idx * 0.08}s both`,
                      }
                }
              />

              {/* Batsman 2 bar segment */}
              <rect
                x={PADDING.left + b1W}
                y={y}
                width={Math.max(0, b2W)}
                height={BAR_HEIGHT}
                rx={4}
                fill={COLOR_2}
                opacity={isHovered ? 1 : 0.8}
                stroke={p.isUnbroken ? 'var(--text-primary)' : 'none'}
                strokeWidth={p.isUnbroken ? 1.5 : 0}
                strokeDasharray={p.isUnbroken ? '5 3' : 'none'}
                style={
                  prefersReducedMotion
                    ? {}
                    : {
                        transform: 'scaleX(1)',
                        transformOrigin: `${PADDING.left}px ${y + BAR_HEIGHT / 2}px`,
                        animation: `partnership-grow 0.5s ease-out ${idx * 0.08 + 0.1}s both`,
                      }
                }
              />

              {/* Runs label inside bar (if wide enough) */}
              {totalBarW > 40 && (
                <text
                  x={PADDING.left + totalBarW / 2}
                  y={y + BAR_HEIGHT / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="11"
                  fontWeight="700"
                  fill="white"
                  style={{ pointerEvents: 'none' }}
                >
                  {p.runs}
                </text>
              )}

              {/* Annotation to the right */}
              <text
                x={PADDING.left + totalBarW + 8}
                y={y + BAR_HEIGHT / 2 + 1}
                textAnchor="start"
                dominantBaseline="central"
                fontSize="10"
                fill="var(--text-tertiary)"
                style={{ pointerEvents: 'none' }}
              >
                {p.runs} ({p.balls}b){p.isUnbroken ? '*' : ''}
              </text>

              {/* Hover tooltip with batsman breakdown */}
              {isHovered && (
                <g>
                  <rect
                    x={PADDING.left + totalBarW / 2 - 70}
                    y={y - 34}
                    width="140"
                    height="28"
                    rx="6"
                    fill="var(--bg-card)"
                    stroke="var(--border-medium)"
                    strokeWidth="1"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                  />
                  <text
                    x={PADDING.left + totalBarW / 2}
                    y={y - 16}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="500"
                    fill="var(--text-primary)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {p.batsman1Name || p.batsman1Id.slice(0, 8)}: {b1Runs} |{' '}
                    {p.batsman2Name || p.batsman2Id.slice(0, 8)}: {b2Runs}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_1, opacity: 0.8 }} />
          <span className="text-theme-secondary">Batsman 1</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_2, opacity: 0.8 }} />
          <span className="text-theme-secondary">Batsman 2</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm inline-block border border-dashed"
            style={{ borderColor: 'var(--text-primary)' }}
          />
          <span className="text-theme-secondary">Unbroken</span>
        </div>
      </div>

      <style>{`
        @keyframes partnership-grow {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
