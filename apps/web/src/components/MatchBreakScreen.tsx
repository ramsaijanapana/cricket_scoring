import { useEffect, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type BreakType = 'innings_break' | 'rain_delay' | 'lunch' | 'tea' | 'drinks' | 'stumps';

interface MatchBreakScreenProps {
  type: BreakType;
  matchData?: any;
  targetScore?: number;
  dlsTarget?: number;
  daySummary?: { runs: number; wickets: number };
}

// ─── Break config ───────────────────────────────────────────────────────────

interface BreakConfig {
  title: string;
  subtitle: string;
  icon: JSX.Element;
  gradient: string;
}

function getBreakConfig(
  type: BreakType,
  props: Pick<MatchBreakScreenProps, 'targetScore' | 'dlsTarget' | 'daySummary'>,
): BreakConfig {
  switch (type) {
    case 'innings_break':
      return {
        title: 'Innings Break',
        subtitle: props.targetScore
          ? `Target: ${props.targetScore} runs`
          : 'Teams switching sides',
        icon: <InningsBreakIcon />,
        gradient: 'from-emerald-900/80 to-emerald-950/90',
      };
    case 'rain_delay':
      return {
        title: 'Rain Delay',
        subtitle: props.dlsTarget
          ? `DLS revised target: ${props.dlsTarget}`
          : 'Play suspended due to rain',
        icon: <RainIcon />,
        gradient: 'from-blue-900/80 to-slate-950/90',
      };
    case 'lunch':
      return {
        title: 'Lunch Break',
        subtitle: 'Play resumes shortly',
        icon: <ClockIcon />,
        gradient: 'from-amber-900/80 to-amber-950/90',
      };
    case 'tea':
      return {
        title: 'Tea Break',
        subtitle: 'Play resumes shortly',
        icon: <ClockIcon />,
        gradient: 'from-amber-900/80 to-orange-950/90',
      };
    case 'drinks':
      return {
        title: 'Drinks Break',
        subtitle: 'Play resumes shortly',
        icon: <ClockIcon />,
        gradient: 'from-cyan-900/80 to-cyan-950/90',
      };
    case 'stumps':
      return {
        title: 'Stumps',
        subtitle: props.daySummary
          ? `Today: ${props.daySummary.runs} runs, ${props.daySummary.wickets} wickets`
          : 'Play resumes tomorrow',
        icon: <MoonIcon />,
        gradient: 'from-indigo-900/80 to-slate-950/90',
      };
  }
}

// ─── SVG Icons ──────────────────────────────────────────────────────────────

function InningsBreakIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/80"
    >
      <path d="M7 21h10" />
      <path d="M12 21V3" />
      <path d="M3 7l4-4 4 4" />
      <path d="M13 7l4-4 4 4" />
    </svg>
  );
}

function RainIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-300/80"
    >
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 14v6" />
      <path d="M8 14v6" />
      <path d="M12 16v6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-amber-300/80"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-indigo-300/80"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MatchBreakScreen({
  type,
  matchData,
  targetScore,
  dlsTarget,
  daySummary,
}: MatchBreakScreenProps) {
  const [visible, setVisible] = useState(false);

  // Trigger entrance animation on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const config = getBreakConfig(type, { targetScore, dlsTarget, daySummary });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s ease-out',
        }}
      />

      {/* Content card */}
      <div
        className={`relative z-10 mx-4 max-w-md w-full rounded-2xl bg-gradient-to-b ${config.gradient} border border-white/10 shadow-2xl overflow-hidden`}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.9)',
          transition: 'opacity 0.4s ease-out 0.1s, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.1s',
        }}
      >
        {/* Decorative gradient strip */}
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="px-8 py-10 flex flex-col items-center text-center">
          {/* Icon */}
          <div
            className="mb-6"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 0.4s ease-out 0.25s, transform 0.4s ease-out 0.25s',
            }}
          >
            {config.icon}
          </div>

          {/* Title */}
          <h2
            className="text-2xl font-black text-white tracking-tight mb-2"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.3s ease-out 0.35s, transform 0.3s ease-out 0.35s',
            }}
          >
            {config.title}
          </h2>

          {/* Subtitle */}
          <p
            className="text-sm text-white/70 font-medium"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.3s ease-out 0.45s, transform 0.3s ease-out 0.45s',
            }}
          >
            {config.subtitle}
          </p>

          {/* Innings break: target score highlight */}
          {type === 'innings_break' && targetScore && (
            <div
              className="mt-6 px-6 py-3 rounded-xl bg-white/10 border border-white/10"
              style={{
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.3s ease-out 0.55s',
              }}
            >
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest block mb-1">
                Target
              </span>
              <span className="text-3xl font-black text-white tabular-nums">{targetScore}</span>
            </div>
          )}

          {/* Rain delay: DLS target */}
          {type === 'rain_delay' && dlsTarget && (
            <div
              className="mt-6 px-6 py-3 rounded-xl bg-white/10 border border-white/10"
              style={{
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.3s ease-out 0.55s',
              }}
            >
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest block mb-1">
                DLS Revised Target
              </span>
              <span className="text-3xl font-black text-white tabular-nums">{dlsTarget}</span>
            </div>
          )}

          {/* Stumps: day summary */}
          {type === 'stumps' && daySummary && (
            <div
              className="mt-6 flex items-center gap-6"
              style={{
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.3s ease-out 0.55s',
              }}
            >
              <div className="text-center">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest block mb-1">
                  Runs Today
                </span>
                <span className="text-2xl font-black text-white tabular-nums">
                  {daySummary.runs}
                </span>
              </div>
              <div className="w-px h-10 bg-white/20" />
              <div className="text-center">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest block mb-1">
                  Wickets Today
                </span>
                <span className="text-2xl font-black text-white tabular-nums">
                  {daySummary.wickets}
                </span>
              </div>
            </div>
          )}

          {/* Pulsing dot indicator */}
          <div
            className="mt-8 flex items-center gap-1.5"
            style={{
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.3s ease-out 0.6s',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full bg-white/40"
              style={{ animation: 'break-pulse 1.4s ease-in-out infinite' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-white/40"
              style={{ animation: 'break-pulse 1.4s ease-in-out 0.2s infinite' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-white/40"
              style={{ animation: 'break-pulse 1.4s ease-in-out 0.4s infinite' }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes break-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}
