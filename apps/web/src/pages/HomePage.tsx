import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trophy, Zap } from 'lucide-react';
import { api } from '../lib/api';

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 },
  },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const skeletonVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

export function HomePage() {
  const { data: matches, isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: api.getMatches,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Hero section */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="hero-gradient rounded-2xl p-8 mb-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.3), transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15), transparent 40%)' }} />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white mb-1">CricScore</h1>
            <p className="text-white/70 text-sm">
              {matches?.length ? `${matches.length} match${matches.length > 1 ? 'es' : ''} tracked` : 'Real-time cricket scoring'}
            </p>
          </div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link to="/matches/new" className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-semibold flex items-center gap-1.5 px-5 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-black/10">
              <Plus size={16} className="shrink-0" />
              New Match
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <h2 className="text-xl font-bold tracking-tight">Matches</h2>
        </motion.div>
      </div>

      {/* Match list */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="skeleton"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="grid gap-4 mobile-l:grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3"
          >
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                variants={skeletonVariants}
                className="card"
              >
                <div
                  className="h-5 rounded-lg w-2/3 mb-3"
                  style={{
                    background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                  }}
                />
                <div
                  className="h-3 rounded-lg w-1/3 mb-6"
                  style={{
                    background: 'linear-gradient(90deg, var(--border-subtle) 25%, var(--bg-hover) 50%, var(--border-subtle) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    animationDelay: '0.15s',
                  }}
                />
                <div className="flex gap-2">
                  <div
                    className="h-10 rounded-xl flex-1"
                    style={{
                      background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s ease-in-out infinite',
                      animationDelay: '0.3s',
                    }}
                  />
                  <div
                    className="h-10 rounded-xl flex-1"
                    style={{
                      background: 'linear-gradient(90deg, var(--border-subtle) 25%, var(--bg-hover) 50%, var(--border-subtle) 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s ease-in-out infinite',
                      animationDelay: '0.45s',
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : !matches?.length ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="flex flex-col items-center justify-center py-24 gap-5"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-24 h-24 rounded-3xl flex items-center justify-center mb-3 relative"
              style={{ background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.12), rgba(5, 150, 105, 0.08))' }}
            >
              <div className="absolute inset-0 rounded-3xl" style={{ border: '1px solid rgba(22, 163, 74, 0.15)' }} />
              <Trophy size={40} className="text-cricket-green opacity-60" />
            </motion.div>
            <p className="text-theme-primary text-xl font-bold">No matches yet</p>
            <p className="text-theme-tertiary text-sm max-w-xs text-center">Create your first match and start scoring live cricket action</p>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link to="/matches/new" className="btn-primary text-sm mt-2 inline-flex items-center gap-2">
                <Zap size={14} />
                Create Match
              </Link>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="matches"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4 mobile-l:grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3"
          >
            {matches.map((match: any) => (
              <motion.div
                key={match.id}
                variants={cardVariants}
              >
                <MatchCard match={match} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MatchCard({ match }: { match: any }) {
  const statusConfig: Record<string, { label: string; class: string; dot?: boolean }> = {
    live: { label: 'LIVE', class: 'badge-live', dot: true },
    completed: { label: 'COMPLETED', class: 'badge-completed' },
    scheduled: { label: 'SCHEDULED', class: 'badge-scheduled' },
    rain_delay: { label: 'RAIN DELAY', class: 'badge-delay' },
    innings_break: { label: 'INNINGS BREAK', class: 'badge-delay' },
    abandoned: { label: 'ABANDONED', class: 'badge bg-cricket-red/15 text-cricket-red' },
    toss: { label: 'TOSS', class: 'badge-scheduled' },
  };

  const status = statusConfig[match.status] || statusConfig.scheduled;

  const accentColor = match.status === 'live' ? '#16a34a' : match.status === 'scheduled' ? '#3b82f6' : '#737373';
  const isLive = match.status === 'live';

  return (
    <motion.div
      className="card card-hover group cursor-default relative overflow-hidden"
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background: `linear-gradient(180deg, ${accentColor}, ${accentColor}80)` }}
      />

      {/* Live gradient overlay */}
      {isLive && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.04), transparent 60%)' }} />
      )}

      {/* Team names + score */}
      <div className="mb-4 relative">
        <div className="flex items-center justify-between mb-3">
          <span className={status.class}>
            {status.dot && (
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-current inline-block"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            {status.label}
          </span>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-theme-primary text-base">{match.homeTeamName || 'Home'}</span>
            {match.currentScore && match.status === 'live' && (
              <span className="font-black text-theme-primary text-xl tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {match.currentScore}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-theme-secondary text-base">{match.awayTeamName || 'Away'}</span>
            {match.currentOvers && match.status === 'live' && (
              <span className="text-theme-tertiary text-sm font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ({match.currentOvers} ov)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Venue */}
      <div className="text-xs text-theme-tertiary mb-4">
        {match.venue && <span>{match.venue}</span>}
        {match.venue && match.city && <span> · </span>}
        {match.city && <span>{match.city}</span>}
      </div>

      {match.resultSummary && (
        <p className="text-sm text-cricket-green font-semibold mb-4 leading-relaxed">{match.resultSummary}</p>
      )}

      <div className="flex gap-2">
        <Link
          to={`/matches/${match.id}/score`}
          className="btn-primary flex-1 text-center text-sm py-2.5"
        >
          Score
        </Link>
        <Link
          to={`/matches/${match.id}/scorecard`}
          className="btn-outline flex-1 text-center text-sm py-2.5"
        >
          Scorecard
        </Link>
      </div>
    </motion.div>
  );
}
