import { useMemo, useRef, useEffect, useState } from 'react';
import type { WagonWheelPoint } from '../../lib/api';

interface WagonWheelProps {
  data: WagonWheelPoint[];
}

export function WagonWheel({ data }: WagonWheelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(400);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Keep it square, capped at container width
        const w = entry.contentRect.width;
        setSize(Math.min(w, 460));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const center = size / 2;
  const fieldRadius = size * 0.44;
  const pitchHalfLen = size * 0.06;
  const pitchHalfW = size * 0.015;

  // Normalize wagonX/wagonY to field coordinates
  // wagonX, wagonY are assumed to be in [-1, 1] range (normalized field coords)
  const shots = useMemo(() => {
    return data.map((p) => {
      const dx = p.wagonX * fieldRadius;
      const dy = -p.wagonY * fieldRadius; // SVG y is inverted
      return {
        ...p,
        endX: center + dx,
        endY: center + dy,
      };
    });
  }, [data, center, fieldRadius]);

  const getColor = (runs: number) => {
    if (runs >= 6) return 'var(--color-red)';
    if (runs === 4) return 'var(--color-blue)';
    return 'var(--color-green)';
  };

  const getStrokeWidth = (runs: number) => {
    if (runs >= 6) return 2.5;
    if (runs === 4) return 2;
    return 1.2;
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-theme-muted text-sm">
        No wagon wheel data available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="select-none"
        role="img"
        aria-label="Wagon wheel showing shot directions"
      >
        {/* Field background */}
        <circle cx={center} cy={center} r={fieldRadius} fill="rgba(22, 163, 74, 0.06)" stroke="var(--border-subtle)" strokeWidth="1" />

        {/* Inner rings (30-yard circle and boundary) */}
        <circle cx={center} cy={center} r={fieldRadius * 0.55} fill="none" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 4" />

        {/* Pitch rectangle */}
        <rect
          x={center - pitchHalfW}
          y={center - pitchHalfLen}
          width={pitchHalfW * 2}
          height={pitchHalfLen * 2}
          rx="2"
          fill="rgba(217, 179, 113, 0.25)"
          stroke="rgba(217, 179, 113, 0.4)"
          strokeWidth="1"
        />

        {/* Compass lines (light) */}
        {[0, 45, 90, 135].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line
              key={angle}
              x1={center + Math.cos(rad) * fieldRadius * 0.15}
              y1={center - Math.sin(rad) * fieldRadius * 0.15}
              x2={center + Math.cos(rad) * fieldRadius}
              y2={center - Math.sin(rad) * fieldRadius}
              stroke="var(--border-subtle)"
              strokeWidth="0.5"
              opacity="0.5"
            />
          );
        })}
        {[180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line
              key={angle}
              x1={center + Math.cos(rad) * fieldRadius * 0.15}
              y1={center - Math.sin(rad) * fieldRadius * 0.15}
              x2={center + Math.cos(rad) * fieldRadius}
              y2={center - Math.sin(rad) * fieldRadius}
              stroke="var(--border-subtle)"
              strokeWidth="0.5"
              opacity="0.5"
            />
          );
        })}

        {/* Shot lines */}
        {shots.map((shot, idx) => {
          const color = getColor(shot.runs);
          const strokeW = getStrokeWidth(shot.runs);
          const isHovered = hoveredIdx === idx;
          return (
            <g
              key={shot.deliveryId || idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'default' }}
            >
              <line
                x1={center}
                y1={center}
                x2={shot.endX}
                y2={shot.endY}
                stroke={color}
                strokeWidth={isHovered ? strokeW + 1 : strokeW}
                strokeLinecap="round"
                opacity={isHovered ? 1 : 0.65}
                style={prefersReducedMotion ? {} : {
                  strokeDasharray: `${fieldRadius * 2}`,
                  strokeDashoffset: `${fieldRadius * 2}`,
                  animation: `wagon-draw 0.4s ease-out ${idx * 0.02}s forwards`,
                }}
              />
              {/* End dot */}
              <circle
                cx={shot.endX}
                cy={shot.endY}
                r={isHovered ? 5 : 3}
                fill={color}
                opacity={isHovered ? 1 : 0.8}
                style={prefersReducedMotion ? {} : {
                  opacity: 0,
                  animation: `worm-dot 0.2s ease-out ${idx * 0.02 + 0.3}s forwards`,
                }}
              />

              {/* Tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={shot.endX + 8}
                    y={shot.endY - 14}
                    width="52"
                    height="22"
                    rx="5"
                    fill="var(--bg-card)"
                    stroke="var(--border-medium)"
                    strokeWidth="1"
                  />
                  <text
                    x={shot.endX + 34}
                    y={shot.endY + 1}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {shot.runs} run{shot.runs !== 1 ? 's' : ''}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Center batsman marker */}
        <circle cx={center} cy={center} r="4" fill="var(--text-primary)" opacity="0.7" />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[2px] rounded-full inline-block" style={{ background: 'var(--color-green)' }} />
          <span className="text-theme-secondary">1-3 runs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[2px] rounded-full inline-block" style={{ background: 'var(--color-blue)' }} />
          <span className="text-theme-secondary">Four</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full inline-block" style={{ background: 'var(--color-red)' }} />
          <span className="text-theme-secondary">Six</span>
        </div>
      </div>

      <style>{`
        @keyframes wagon-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes worm-dot {
          to { opacity: 0.8; }
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
