import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { Delivery } from '@cricket/shared';
import { api } from '../lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OverGroup {
  overNum: number;
  bowlerId: string;
  bowlerName: string;
  balls: Delivery[];
  totalRuns: number;
  wickets: number;
  extras: { wides: number; noBalls: number; byes: number; legByes: number };
}

// ─── Ball color helpers ─────────────────────────────────────────────────────

function getBallColor(ball: Delivery): string {
  if (ball.isWicket) return 'bg-red-500 text-white';
  if (ball.runsBatsman === 4) return 'bg-emerald-500 text-white';
  if (ball.runsBatsman === 6) return 'bg-emerald-600 text-white';
  if (ball.extraType) return 'bg-amber-400 text-amber-950';
  if (ball.totalRuns === 0) return 'bg-zinc-500/30 text-theme-secondary';
  return 'bg-white/90 text-zinc-800';
}

function getBallLabel(ball: Delivery): string {
  if (ball.isWicket) return 'W';
  const parts: string[] = [];
  if (ball.extraType === 'wide') parts.push('Wd');
  else if (ball.extraType === 'noball') parts.push('Nb');
  else if (ball.extraType === 'bye') parts.push('B');
  else if (ball.extraType === 'legbye') parts.push('Lb');

  if (ball.totalRuns > 0 && parts.length > 0) {
    parts.push(String(ball.totalRuns));
    return parts.join('');
  }
  if (parts.length > 0) return parts.join('');
  return String(ball.totalRuns);
}

// ─── Group deliveries by over ───────────────────────────────────────────────

function groupByOver(deliveries: Delivery[], playerNames: Record<string, string>): OverGroup[] {
  const map = new Map<number, Delivery[]>();
  for (const d of deliveries) {
    const list = map.get(d.overNum) || [];
    list.push(d);
    map.set(d.overNum, list);
  }

  const groups: OverGroup[] = [];
  const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);

  for (const overNum of sortedKeys) {
    const balls = map.get(overNum)!;
    balls.sort((a, b) => a.ballNum - b.ballNum);

    let totalRuns = 0;
    let wickets = 0;
    const extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0 };

    for (const b of balls) {
      totalRuns += b.totalRuns;
      if (b.isWicket) wickets++;
      if (b.extraType === 'wide') extras.wides += b.runsExtras;
      if (b.extraType === 'noball') extras.noBalls += b.runsExtras;
      if (b.extraType === 'bye') extras.byes += b.runsExtras;
      if (b.extraType === 'legbye') extras.legByes += b.runsExtras;
    }

    const bowlerId = balls[0]?.bowlerId || '';
    const bowlerName = playerNames[bowlerId] || 'Unknown';

    groups.push({ overNum, bowlerId, bowlerName, balls, totalRuns, wickets, extras });
  }

  return groups;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OverByOverPage() {
  const { matchId } = useParams<{ matchId: string }>();

  const { data: matchData } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.getMatch(matchId!),
    enabled: !!matchId,
  });

  const {
    data: deliveries,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['deliveries', matchId],
    queryFn: () =>
      api.getScorecard(matchId!).then(() =>
        // Deliveries endpoint returns all deliveries for the match
        fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/matches/${matchId}/deliveries`, {
          headers: {
            'Content-Type': 'application/json',
            ...(localStorage.getItem('access_token')
              ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
              : {}),
          },
        }).then((r) => r.json() as Promise<Delivery[]>),
      ),
    enabled: !!matchId,
  });

  // Build player name lookup from match teams
  const playerNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const team of matchData?.teams || []) {
      if (team.playerNames) {
        Object.assign(names, team.playerNames);
      }
    }
    return names;
  }, [matchData]);

  const overGroups = useMemo(() => {
    if (!deliveries || !Array.isArray(deliveries)) return [];
    return groupByOver(deliveries, playerNames);
  }, [deliveries, playerNames]);

  const teamNames = matchData?.teams?.map((t) => t.teamName) || [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl mx-auto"
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link
          to={`/matches/${matchId}/scorecard`}
          className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors py-1"
        >
          <ArrowLeft size={16} />
          <span>Scorecard</span>
        </Link>
      </div>

      <div className="card mb-6 text-center py-5 gradient-strip-top">
        <h1 className="text-theme-primary text-xl font-black tracking-tight">Over-by-Over</h1>
        {teamNames.length >= 2 && (
          <p className="text-theme-tertiary text-sm mt-1">
            {teamNames[0]} vs {teamNames[1]}
          </p>
        )}
      </div>

      {/* Loading / Error states */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div
            className="h-4 w-32 rounded-lg"
            style={{
              background:
                'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
        </div>
      )}

      {isError && (
        <div className="card py-12 text-center">
          <p className="text-theme-muted text-sm mb-3">Failed to load delivery data.</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-cricket-green text-white"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      {/* Over list */}
      {!isLoading && !isError && overGroups.length === 0 && (
        <div className="flex items-center justify-center py-12 text-theme-muted text-sm">
          No deliveries recorded yet.
        </div>
      )}

      <div className="space-y-3">
        {overGroups.map((over, idx) => {
          const prevBowler = idx > 0 ? overGroups[idx - 1].bowlerId : null;
          const bowlerChanged = prevBowler !== null && prevBowler !== over.bowlerId;

          return (
            <motion.div
              key={over.overNum}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24, delay: idx * 0.03 }}
            >
              {/* Bowler change indicator */}
              {bowlerChanged && (
                <div className="flex items-center gap-2 mb-2 px-2">
                  <RefreshCw size={12} className="text-cricket-green" />
                  <span className="text-[11px] font-semibold text-cricket-green uppercase tracking-wider">
                    Bowling change: {over.bowlerName}
                  </span>
                </div>
              )}

              <div className="card px-4 py-3">
                {/* Over header row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-theme-primary bg-cricket-green/15 text-cricket-green px-2 py-0.5 rounded-md">
                      Ov {over.overNum + 1}
                    </span>
                    <span className="text-xs text-theme-secondary font-medium">
                      {over.bowlerName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-theme-primary">{over.totalRuns} runs</span>
                    {over.wickets > 0 && (
                      <span className="font-bold text-red-400">{over.wickets}w</span>
                    )}
                  </div>
                </div>

                {/* Ball circles */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {over.balls.map((ball) => (
                    <div
                      key={ball.id}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${getBallColor(ball)}`}
                      title={`Ball ${ball.ballNum}: ${getBallLabel(ball)} run(s)`}
                    >
                      {getBallLabel(ball)}
                    </div>
                  ))}
                </div>

                {/* Extras breakdown (only if extras exist) */}
                {(over.extras.wides > 0 ||
                  over.extras.noBalls > 0 ||
                  over.extras.byes > 0 ||
                  over.extras.legByes > 0) && (
                  <div className="mt-2 flex gap-3 text-[10px] text-theme-muted">
                    {over.extras.wides > 0 && <span>Wd: {over.extras.wides}</span>}
                    {over.extras.noBalls > 0 && <span>Nb: {over.extras.noBalls}</span>}
                    {over.extras.byes > 0 && <span>B: {over.extras.byes}</span>}
                    {over.extras.legByes > 0 && <span>Lb: {over.extras.legByes}</span>}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
