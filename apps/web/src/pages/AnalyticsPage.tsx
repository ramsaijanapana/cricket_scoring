import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, BarChart3, Activity, Target, CircleDot } from 'lucide-react';
import { api } from '../lib/api';
import { WormChart } from '../components/charts/WormChart';
import { ManhattanChart } from '../components/charts/ManhattanChart';
import { WagonWheel } from '../components/charts/WagonWheel';
import { PitchMap } from '../components/charts/PitchMap';

type InningsFilter = 'all' | number;

export function AnalyticsPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const [inningsFilter, setInningsFilter] = useState<InningsFilter>('all');

  const { data: matchData } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.getMatch(matchId!),
    enabled: !!matchId,
  });

  const { data: scorecard } = useQuery({
    queryKey: ['scorecard', matchId],
    queryFn: () => api.getScorecard(matchId!),
    enabled: !!matchId,
  });

  const { data: wormData, isLoading: wormLoading } = useQuery({
    queryKey: ['worm', matchId],
    queryFn: () => api.getWormChart(matchId!),
    enabled: !!matchId,
  });

  const { data: manhattanData, isLoading: manhattanLoading } = useQuery({
    queryKey: ['manhattan', matchId],
    queryFn: () => api.getManhattan(matchId!),
    enabled: !!matchId,
  });

  const wagonWheelParams = inningsFilter !== 'all' ? { inningsNum: String(inningsFilter) } : undefined;
  const { data: wagonData, isLoading: wagonLoading } = useQuery({
    queryKey: ['wagon-wheel', matchId, inningsFilter],
    queryFn: () => api.getWagonWheel(matchId!, wagonWheelParams),
    enabled: !!matchId,
  });

  const pitchMapParams = inningsFilter !== 'all' ? { inningsNum: String(inningsFilter) } : undefined;
  const { data: pitchData, isLoading: pitchLoading } = useQuery({
    queryKey: ['pitch-map', matchId, inningsFilter],
    queryFn: () => api.getPitchMap(matchId!, pitchMapParams),
    enabled: !!matchId,
  });

  const teamNames = matchData?.teams?.map((t) => t.teamName) || [];
  const inningsCount = scorecard?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto"
    >
      {/* Back nav */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="mb-4 flex items-center justify-between flex-wrap gap-3"
      >
        <Link
          to={`/matches/${matchId}/scorecard`}
          className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors min-h-0 min-w-0 py-1"
        >
          <ArrowLeft size={16} />
          <span>Back to Scorecard</span>
        </Link>
      </motion.div>

      {/* Match header */}
      {matchData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="card mb-6 text-center py-6 relative overflow-hidden gradient-strip-top"
        >
          <div className="relative z-10">
            <h1 className="text-theme-primary text-xl font-black tracking-tight">
              Match Analytics
            </h1>
            <p className="text-theme-tertiary text-sm mt-1">
              {teamNames[0] || 'Home'} vs {teamNames[1] || 'Away'}
              {matchData.venue ? ` - ${matchData.venue}` : ''}
            </p>
          </div>
        </motion.div>
      )}

      {/* Innings filter */}
      {inningsCount > 1 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-[11px] font-bold text-theme-muted uppercase tracking-widest">Filter:</span>
          <button
            onClick={() => setInningsFilter('all')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all min-h-0 min-w-0 ${
              inningsFilter === 'all'
                ? 'bg-cricket-green text-white'
                : 'surface-interactive'
            }`}
          >
            All Innings
          </button>
          {Array.from({ length: inningsCount }).map((_, i) => {
            const num = i + 1;
            const label = scorecard?.[i]?.battingTeamName || `Innings ${num}`;
            return (
              <button
                key={num}
                onClick={() => setInningsFilter(num)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all min-h-0 min-w-0 ${
                  inningsFilter === num
                    ? 'bg-cricket-green text-white'
                    : 'surface-interactive'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worm Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 22, delay: 0.05 }}
          className="card relative overflow-hidden lg:col-span-2"
        >
          <ChartHeader icon={<Activity size={16} />} title="Worm Chart" subtitle="Cumulative runs over overs" />
          {wormLoading ? <ChartSkeleton /> : <WormChart data={wormData || []} teamNames={teamNames} />}
        </motion.div>

        {/* Manhattan Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 22, delay: 0.1 }}
          className="card relative overflow-hidden lg:col-span-2"
        >
          <ChartHeader icon={<BarChart3 size={16} />} title="Manhattan" subtitle="Runs scored per over" />
          {manhattanLoading ? <ChartSkeleton /> : <ManhattanChart data={manhattanData || []} />}
        </motion.div>

        {/* Wagon Wheel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 22, delay: 0.15 }}
          className="card relative overflow-hidden"
        >
          <ChartHeader icon={<CircleDot size={16} />} title="Wagon Wheel" subtitle="Shot directions and placement" />
          {wagonLoading ? <ChartSkeleton /> : <WagonWheel data={wagonData || []} />}
        </motion.div>

        {/* Pitch Map */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 22, delay: 0.2 }}
          className="card relative overflow-hidden"
        >
          <ChartHeader icon={<Target size={16} />} title="Pitch Map" subtitle="Ball landing positions" />
          {pitchLoading ? <ChartSkeleton /> : <PitchMap data={pitchData || []} />}
        </motion.div>
      </div>
    </motion.div>
  );
}

function ChartHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-cricket-green">{icon}</span>
      <div>
        <h2 className="text-theme-primary text-sm font-bold">{title}</h2>
        <p className="text-theme-muted text-[11px]">{subtitle}</p>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex items-center justify-center py-16">
      <div
        className="h-4 w-32 rounded-lg"
        style={{
          background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }}
      />
    </div>
  );
}
