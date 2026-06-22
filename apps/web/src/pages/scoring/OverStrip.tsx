import { motion } from 'framer-motion';
import type { BallDisplay } from '../../stores/scoring-store';
import { ballBubbleVariants, itemVariants } from './animationVariants';

export interface OverStripProps {
  balls: BallDisplay[];
  runs: number;
  reduceMotion: boolean;
}

export function OverStrip({ balls, runs, reduceMotion }: OverStripProps) {
  return (
    <motion.div
      className="card p-3"
      variants={reduceMotion ? undefined : itemVariants}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest">
          This Over {balls.length > 0 && `(${balls.length})`}
        </span>
        <span className="text-xs font-semibold text-theme-secondary tabular-nums">{runs} runs</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {balls.length > 0 ? (
          balls.map((ball, i) => (
            <motion.div
              key={i}
              custom={i}
              variants={reduceMotion ? undefined : ballBubbleVariants}
              initial={reduceMotion ? undefined : 'hidden'}
              animate={reduceMotion ? undefined : 'visible'}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ball-${ball.type}`}
              style={{ willChange: 'transform' }}
            >
              {ball.label}
            </motion.div>
          ))
        ) : (
          <span className="text-xs text-theme-muted">No balls yet</span>
        )}
      </div>
    </motion.div>
  );
}
