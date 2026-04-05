import { useMemo, useRef, useEffect, useState } from 'react';
import type { PitchMapPoint } from '../../lib/api';

interface PitchMapProps {
  data: PitchMapPoint[];
}

export function PitchMap({ data }: PitchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Pitch is roughly 3:1 ratio (longer than wide)
  const width = Math.min(containerWidth, 300);
  const height = width * 2.4;
  const pitchPadding = { top: 24, bottom: 24, left: 24, right: 24 };
  const pitchW = width - pitchPadding.left - pitchPadding.right;
  const pitchH = height - pitchPadding.top - pitchPadding.bottom;

  // landingX, landingY are assumed [0, 1] normalized
  const dots = useMemo(() => {
    return data.map((p) => ({
      ...p,
      cx: pitchPadding.left + p.landingX * pitchW,
      cy: pitchPadding.top + p.landingY * pitchH,
    }));
  }, [data, pitchW, pitchH]);

  const getColor = (p: PitchMapPoint) => {
    if (p.isWicket) return 'var(--color-red)';
    if (p.runs === 0) return 'var(--text-muted)';
    return 'var(--color-green)';
  };

  const getRadius = (p: PitchMapPoint) => {
    if (p.isWicket) return 6;
    if (p.runs === 0) return 3.5;
    if (p.runs >= 6) return 7;
    if (p.runs >= 4) return 5.5;
    return 4;
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-theme-muted text-sm">
        No pitch map data available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="select-none"
        role="img"
        aria-label="Pitch map showing ball landing positions"
      >
        {/* Pitch background */}
        <rect
          x={pitchPadding.left}
          y={pitchPadding.top}
          width={pitchW}
          height={pitchH}
          rx="6"
          fill="rgba(217, 179, 113, 0.12)"
          stroke="rgba(217, 179, 113, 0.3)"
          strokeWidth="1.5"
        />

        {/* Crease lines */}
        {/* Batting crease (near bottom) */}
        <line
          x1={pitchPadding.left}
          y1={pitchPadding.top + pitchH * 0.82}
          x2={pitchPadding.left + pitchW}
          y2={pitchPadding.top + pitchH * 0.82}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="1.5"
        />
        {/* Popping crease */}
        <line
          x1={pitchPadding.left}
          y1={pitchPadding.top + pitchH * 0.76}
          x2={pitchPadding.left + pitchW}
          y2={pitchPadding.top + pitchH * 0.76}
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        {/* Bowling crease (near top) */}
        <line
          x1={pitchPadding.left}
          y1={pitchPadding.top + pitchH * 0.18}
          x2={pitchPadding.left + pitchW}
          y2={pitchPadding.top + pitchH * 0.18}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="1.5"
        />

        {/* Length zone labels */}
        <text x={width - 6} y={pitchPadding.top + pitchH * 0.12} textAnchor="end" fill="var(--text-muted)" fontSize="9" opacity="0.6">
          Yorker
        </text>
        <text x={width - 6} y={pitchPadding.top + pitchH * 0.35} textAnchor="end" fill="var(--text-muted)" fontSize="9" opacity="0.6">
          Full
        </text>
        <text x={width - 6} y={pitchPadding.top + pitchH * 0.50} textAnchor="end" fill="var(--text-muted)" fontSize="9" opacity="0.6">
          Good
        </text>
        <text x={width - 6} y={pitchPadding.top + pitchH * 0.65} textAnchor="end" fill="var(--text-muted)" fontSize="9" opacity="0.6">
          Short
        </text>

        {/* Stumps (small rectangles) */}
        {/* Batting end stumps */}
        <rect
          x={width / 2 - 6}
          y={pitchPadding.top + pitchH * 0.82 - 2}
          width={12}
          height={4}
          rx="1"
          fill="rgba(255, 255, 255, 0.5)"
        />
        {/* Bowling end stumps */}
        <rect
          x={width / 2 - 6}
          y={pitchPadding.top + pitchH * 0.18 - 2}
          width={12}
          height={4}
          rx="1"
          fill="rgba(255, 255, 255, 0.5)"
        />

        {/* Ball landing dots */}
        {dots.map((dot, idx) => {
          const color = getColor(dot);
          const r = getRadius(dot);
          const isHovered = hoveredIdx === idx;
          return (
            <g
              key={dot.deliveryId || idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'default' }}
            >
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r={isHovered ? r + 2 : r}
                fill={color}
                opacity={isHovered ? 1 : 0.7}
                stroke={dot.isWicket ? 'var(--color-red)' : 'none'}
                strokeWidth={dot.isWicket ? 2 : 0}
                style={prefersReducedMotion ? {} : {
                  opacity: 0,
                  animation: `pitch-dot 0.3s ease-out ${idx * 0.015}s forwards`,
                }}
              />
              {/* Wicket X marker */}
              {dot.isWicket && (
                <g opacity={isHovered ? 1 : 0.85}>
                  <line x1={dot.cx - 3} y1={dot.cy - 3} x2={dot.cx + 3} y2={dot.cy + 3} stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={dot.cx + 3} y1={dot.cy - 3} x2={dot.cx - 3} y2={dot.cy + 3} stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              )}

              {/* Tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={Math.min(dot.cx + 10, width - 70)}
                    y={dot.cy - 14}
                    width="60"
                    height="22"
                    rx="5"
                    fill="var(--bg-card)"
                    stroke="var(--border-medium)"
                    strokeWidth="1"
                  />
                  <text
                    x={Math.min(dot.cx + 40, width - 40)}
                    y={dot.cy + 1}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {dot.isWicket ? 'W' : `${dot.runs}r`}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'var(--color-green)' }} />
          <span className="text-theme-secondary">Runs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'var(--color-red)' }} />
          <span className="text-theme-secondary">Wicket</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'var(--text-muted)' }} />
          <span className="text-theme-secondary">Dot ball</span>
        </div>
      </div>

      <style>{`
        @keyframes pitch-dot {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 0.7; transform: scale(1); }
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
