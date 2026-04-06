import { useMemo } from 'react';

interface FielderPosition {
  name: string;
  x: number;
  y: number;
}

interface FielderPositionSelectorProps {
  onSelect: (position: string) => void;
  selectedPosition?: string;
  players?: Array<{ id: string; name: string }>;
}

// Positions mapped to an SVG coordinate system with viewBox 0 0 400 400.
// The pitch is centered at (200, 200). Positions approximate a standard
// cricket fielding chart with the bowler delivering from the top end.
const FIELDER_POSITIONS: FielderPosition[] = [
  // Close catchers (off side)
  { name: 'Wicket-keeper', x: 200, y: 310 },
  { name: 'First Slip', x: 235, y: 295 },
  { name: 'Second Slip', x: 258, y: 282 },
  { name: 'Gully', x: 280, y: 258 },

  // Inner ring (off side)
  { name: 'Point', x: 310, y: 220 },
  { name: 'Cover', x: 300, y: 160 },
  { name: 'Mid-off', x: 240, y: 110 },

  // Inner ring (on side)
  { name: 'Mid-on', x: 160, y: 110 },
  { name: 'Mid-wicket', x: 105, y: 160 },
  { name: 'Square Leg', x: 90, y: 220 },
  { name: 'Fine Leg', x: 110, y: 310 },

  // Boundary (off side)
  { name: 'Third Man', x: 330, y: 340 },
  { name: 'Deep Point', x: 370, y: 200 },
  { name: 'Deep Cover', x: 350, y: 110 },
  { name: 'Long Off', x: 260, y: 45 },

  // Boundary (on side)
  { name: 'Long On', x: 140, y: 45 },
  { name: 'Deep Mid-wicket', x: 50, y: 110 },
  { name: 'Deep Square Leg', x: 30, y: 200 },
  { name: 'Deep Fine Leg', x: 60, y: 340 },
];

const DOT_RADIUS = 12;
const FIELD_RADIUS = 175;
const INNER_RING = 105;

export function FielderPositionSelector({
  onSelect,
  selectedPosition,
  players,
}: FielderPositionSelectorProps) {
  const playerMap = useMemo(() => {
    if (!players) return null;
    const map = new Map<number, { id: string; name: string }>();
    players.forEach((p, i) => map.set(i, p));
    return map;
  }, [players]);

  return (
    <div className="w-full max-w-md mx-auto">
      <svg
        viewBox="0 0 400 400"
        className="w-full h-auto select-none"
        role="img"
        aria-label="Cricket field diagram for fielder selection"
      >
        {/* Ground fill */}
        <circle
          cx="200"
          cy="200"
          r={FIELD_RADIUS}
          fill="var(--color-green, #16a34a)"
          opacity="0.12"
          stroke="var(--color-green, #16a34a)"
          strokeWidth="2"
          opacity-stroke="0.4"
        />

        {/* Inner ring (30-yard circle) */}
        <circle
          cx="200"
          cy="200"
          r={INNER_RING}
          fill="none"
          stroke="var(--color-green, #16a34a)"
          strokeWidth="1"
          strokeDasharray="6 4"
          opacity="0.35"
        />

        {/* Pitch rectangle */}
        <rect
          x="192"
          y="160"
          width="16"
          height="80"
          rx="2"
          fill="var(--color-green, #16a34a)"
          opacity="0.25"
          stroke="var(--color-green, #16a34a)"
          strokeWidth="1"
          opacity-stroke="0.5"
        />

        {/* Stumps indicators */}
        <line x1="196" y1="160" x2="204" y2="160" stroke="var(--text-muted)" strokeWidth="2" />
        <line x1="196" y1="240" x2="204" y2="240" stroke="var(--text-muted)" strokeWidth="2" />

        {/* Fielder positions */}
        {FIELDER_POSITIONS.map((pos, idx) => {
          const isSelected = selectedPosition === pos.name;
          const player = playerMap?.get(idx);

          return (
            <g
              key={pos.name}
              onClick={() => onSelect(pos.name)}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-label={`Select ${pos.name}${player ? ` (${player.name})` : ''}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(pos.name);
                }
              }}
            >
              {/* Hover/click area (larger than visual dot) */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={DOT_RADIUS + 4}
                fill="transparent"
              />

              {/* Dot */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={DOT_RADIUS}
                fill={isSelected ? 'var(--color-green, #22c55e)' : 'var(--bg-card, #1e293b)'}
                stroke={isSelected ? 'var(--color-green, #22c55e)' : 'var(--text-muted, #94a3b8)'}
                strokeWidth={isSelected ? 2.5 : 1.5}
                opacity={isSelected ? 1 : 0.85}
                className="transition-all duration-150"
              />

              {/* Position initial/number inside dot */}
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="8"
                fontWeight="700"
                fill={isSelected ? 'white' : 'var(--text-primary, #e2e8f0)'}
                style={{ pointerEvents: 'none' }}
              >
                {player ? player.name.substring(0, 2).toUpperCase() : (idx + 1)}
              </text>

              {/* Label */}
              <text
                x={pos.x}
                y={pos.y + DOT_RADIUS + 10}
                textAnchor="middle"
                fontSize="7"
                fontWeight="500"
                fill={isSelected ? 'var(--color-green, #22c55e)' : 'var(--text-tertiary, #64748b)'}
                style={{ pointerEvents: 'none' }}
              >
                {pos.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Selected position display */}
      {selectedPosition && (
        <div className="text-center mt-2 text-sm font-semibold text-cricket-green">
          Selected: {selectedPosition}
        </div>
      )}
    </div>
  );
}
