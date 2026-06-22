import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { EXTRAS_CONFIG, type ExtrasMode } from './types';
import { itemVariants } from './animationVariants';

export interface ScoringPadProps {
  extrasMode: ExtrasMode;
  onExtrasModeChange: (mode: ExtrasMode) => void;
  onRecordRuns: (runs: number) => void;
  onWicketClick: () => void;
  isPending: boolean;
  pendingBowlerChange: boolean;
  scoringDisabled: boolean;
  wicketShake: boolean;
  reduceMotion: boolean;
}

export function ScoringPad({
  extrasMode,
  onExtrasModeChange,
  onRecordRuns,
  onWicketClick,
  isPending,
  pendingBowlerChange,
  scoringDisabled,
  wicketShake,
  reduceMotion,
}: ScoringPadProps) {
  const disabled = isPending || pendingBowlerChange || scoringDisabled;

  return (
    <>
      <motion.div
        className="flex flex-wrap gap-1.5 justify-center"
        variants={reduceMotion ? undefined : itemVariants}
      >
        {EXTRAS_CONFIG.map(({ mode, label, activeClass }) => (
          <motion.button
            key={mode}
            layout={!reduceMotion}
            onClick={() => onExtrasModeChange(mode === extrasMode ? 'normal' : mode)}
            aria-label={`${label} delivery modifier`}
            aria-pressed={extrasMode === mode}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors duration-200 flex items-center gap-1 ${
              extrasMode === mode
                ? `${activeClass} border`
                : 'surface-muted border border-[var(--border-subtle)] hover:border-[var(--border-medium)]'
            }`}
          >
            {label}
            <AnimatePresence>
              {extrasMode === mode && (
                <motion.span
                  initial={reduceMotion ? undefined : { opacity: 0, scale: 0 }}
                  animate={reduceMotion ? undefined : { opacity: 0.6, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  onClick={(e) => { e.stopPropagation(); onExtrasModeChange('normal'); }}
                  className="ml-0.5 hover:opacity-100 cursor-pointer"
                  aria-label={`Dismiss ${label} modifier`}
                >
                  <X size={10} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </motion.div>

      <motion.div
        className="grid grid-cols-4 gap-2"
        variants={reduceMotion ? undefined : itemVariants}
      >
        {[0, 1, 2, 3].map((runs) => (
          <motion.button
            key={runs}
            onClick={() => onRecordRuns(runs)}
            disabled={disabled}
            aria-label={`Score ${runs} run${runs !== 1 ? 's' : ''}`}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className={`min-h-[56px] rounded-2xl flex flex-col items-center justify-center
              text-2xl font-extrabold transition-colors duration-150 disabled:opacity-40
              ${runs === 0 ? 'surface-muted' : 'surface-interactive'}`}
            style={{ willChange: 'transform' }}
          >
            {runs}
          </motion.button>
        ))}
      </motion.div>

      <motion.div
        className="grid grid-cols-2 gap-2"
        variants={reduceMotion ? undefined : itemVariants}
      >
        <motion.button
          onClick={() => onRecordRuns(4)}
          disabled={disabled}
          aria-label="Score 4 runs"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="min-h-[64px] rounded-2xl flex flex-col items-center justify-center
            text-3xl font-extrabold transition-colors duration-150 disabled:opacity-40
            bg-cricket-green/10 text-cricket-green border-2 border-cricket-green/25 hover:bg-cricket-green/15 four-glow btn-ripple"
          style={{ willChange: 'transform' }}
        >
          4
          <span className="text-[9px] font-bold mt-[-2px] tracking-wider opacity-70">FOUR</span>
        </motion.button>
        <motion.button
          onClick={() => onRecordRuns(6)}
          disabled={disabled}
          aria-label="Score 6 runs"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="min-h-[64px] rounded-2xl flex flex-col items-center justify-center
            text-3xl font-extrabold transition-colors duration-150 disabled:opacity-40
            bg-purple-600/10 text-purple-400 border-2 border-purple-500/25 hover:bg-purple-600/15 six-glow btn-ripple"
          style={{ willChange: 'transform' }}
        >
          6
          <span className="text-[9px] font-bold mt-[-2px] tracking-wider opacity-70">SIX</span>
        </motion.button>
      </motion.div>

      <motion.div variants={reduceMotion ? undefined : itemVariants}>
        <motion.button
          onClick={onWicketClick}
          disabled={scoringDisabled}
          aria-label="Record wicket"
          whileTap={reduceMotion ? undefined : { scale: 0.95 }}
          animate={
            !reduceMotion && wicketShake
              ? { x: [0, -2, 2, -2, 2, 0] }
              : { x: 0 }
          }
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="w-full min-h-[56px] rounded-2xl flex items-center justify-center gap-2
            bg-cricket-red/10 text-cricket-red border-2 border-cricket-red/25
            text-lg font-extrabold transition-colors duration-150 disabled:opacity-40
            hover:bg-cricket-red/15 wicket-glow"
          style={{ willChange: 'transform' }}
        >
          <AlertTriangle size={16} className="shrink-0 opacity-70" />
          WICKET
        </motion.button>
      </motion.div>
    </>
  );
}
