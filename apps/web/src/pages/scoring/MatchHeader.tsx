import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { itemVariants } from './animationVariants';

export interface MatchHeaderProps {
  battingTeamName: string;
  score: string;
  overs: string;
  targetScore?: number | null;
  currentRuns?: number;
  computedRunRate: string;
  isChasing: boolean;
  requiredRunRate: number | null;
  reduceMotion: boolean;
}

export function MatchHeader({
  battingTeamName,
  score,
  overs,
  targetScore,
  currentRuns,
  computedRunRate,
  isChasing,
  requiredRunRate,
  reduceMotion,
}: MatchHeaderProps) {
  return (
    <motion.div
      className="card pitch-texture text-center py-6 relative overflow-hidden"
      aria-live="polite"
      variants={reduceMotion ? undefined : itemVariants}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-cricket-green/[0.04] via-transparent to-cricket-green/[0.02] pointer-events-none" />
      <div className="relative">
        <p className="text-xs font-bold text-theme-tertiary uppercase tracking-widest mb-2">
          {battingTeamName}
        </p>
        <div className="score-display" style={{ willChange: 'transform' }}>
          <AnimatePresence mode="wait">
            <motion.span
              key={score}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="inline-block"
            >
              {score}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="text-theme-tertiary text-lg mt-2 font-medium tabular-nums">({overs} ov)</p>
        {targetScore != null && (
          <p className="text-cricket-gold text-sm font-semibold mt-2 flex items-center justify-center gap-2">
            <Trophy size={14} className="opacity-70" />
            <span>Target: {targetScore}</span>
            <span className="text-theme-muted">|</span>
            <span>Need: {targetScore - (currentRuns || 0)}</span>
          </p>
        )}
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className="text-theme-tertiary text-xs font-medium">
            CRR{' '}
            <span className="text-theme-secondary font-semibold tabular-nums">{computedRunRate}</span>
          </span>
          {isChasing && requiredRunRate !== null && (
            <span className="text-theme-tertiary text-xs font-medium">
              RRR{' '}
              <span className="text-cricket-gold font-semibold tabular-nums">
                {Number(requiredRunRate).toFixed(2)}
              </span>
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
