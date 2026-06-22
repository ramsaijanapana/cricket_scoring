import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import { DISMISSAL_TYPES } from './types';
import { dismissalButtonVariants } from './animationVariants';

export interface WicketModalProps {
  open: boolean;
  isFreeHit: boolean;
  wicketDismissalType: string | null;
  wicketRunOutRuns: number;
  runOutDismissedId: string | null;
  currentStrikerId: string | null;
  currentNonStrikerId: string | null;
  allPlayerNames: Record<string, string>;
  reduceMotion: boolean;
  onClose: () => void;
  onDismissalTypeSelect: (type: string) => void;
  onDismissalTypeClear: () => void;
  onRunOutDismissedIdChange: (id: string) => void;
  onWicketRunOutRunsChange: (runs: number) => void;
  onRecordWicket: (wicketType: string, runsOnWicket?: number, dismissedId?: string) => void;
}

export function WicketModal({
  open,
  isFreeHit,
  wicketDismissalType,
  wicketRunOutRuns,
  runOutDismissedId,
  currentStrikerId,
  currentNonStrikerId,
  allPlayerNames,
  reduceMotion,
  onClose,
  onDismissalTypeSelect,
  onDismissalTypeClear,
  onRunOutDismissedIdChange,
  onWicketRunOutRunsChange,
  onRecordWicket,
}: WicketModalProps) {
  const wicketModalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        onDismissalTypeClear();
      }
      if (e.key === 'Tab' && wicketModalRef.current) {
        const focusable = wicketModalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => firstFocusableRef.current?.focus());
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, onDismissalTypeClear]);

  const handleDismissalClick = (type: string) => {
    if (type === 'run_out' || type === 'caught' || type === 'caught_and_bowled') {
      onDismissalTypeSelect(type);
    } else {
      onRecordWicket(type);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end tablet:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
              onDismissalTypeClear();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Wicket dismissal type selector"
        >
          <motion.div
            ref={wicketModalRef}
            className="glass w-full max-w-md p-5"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.95 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">
                {wicketDismissalType ? 'Confirm Wicket' : 'Dismissal Type'}
              </h3>
              <motion.button
                ref={firstFocusableRef}
                onClick={() => {
                  onClose();
                  onDismissalTypeClear();
                }}
                aria-label="Close wicket modal"
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="w-8 h-8 min-w-0 min-h-0 rounded-lg btn-close flex items-center justify-center transition-colors"
              >
                <X size={14} />
              </motion.button>
            </div>

            <AnimatePresence mode="wait">
              {!wicketDismissalType ? (
                <motion.div
                  key="dismissal-picker"
                  className="grid grid-cols-2 gap-2"
                  initial={reduceMotion ? undefined : { opacity: 0 }}
                  animate={reduceMotion ? undefined : { opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {DISMISSAL_TYPES.filter(type => !isFreeHit || type === 'run_out').map((type, i) => (
                    <motion.button
                      key={type}
                      custom={i}
                      variants={reduceMotion ? undefined : dismissalButtonVariants}
                      initial={reduceMotion ? undefined : 'hidden'}
                      animate={reduceMotion ? undefined : 'visible'}
                      onClick={() => handleDismissalClick(type)}
                      aria-label={`Dismiss by ${type.replace(/_/g, ' ')}`}
                      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                      className="surface-interactive py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wide
                        transition-colors duration-150"
                    >
                      {type.replace(/_/g, ' ')}
                    </motion.button>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="dismissal-details"
                  className="flex flex-col gap-4"
                  initial={reduceMotion ? undefined : { opacity: 0, x: 20 }}
                  animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <div className="text-center">
                    <span className="badge-live text-sm">
                      {wicketDismissalType.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>

                  {(wicketDismissalType === 'caught' || wicketDismissalType === 'caught_and_bowled') && (
                    <div className="text-center text-xs text-theme-muted bg-[var(--bg-input)] rounded-xl p-3 border border-[var(--border-subtle)]">
                      Fielder selection coming soon
                    </div>
                  )}

                  {wicketDismissalType === 'run_out' && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-xs text-theme-muted font-semibold mb-2 text-center">Who was run out?</p>
                        <div className="flex gap-2 justify-center">
                          {[
                            { id: currentStrikerId, label: allPlayerNames[currentStrikerId || ''] || 'Striker' },
                            { id: currentNonStrikerId, label: allPlayerNames[currentNonStrikerId || ''] || 'Non-Striker' },
                          ].filter(b => b.id).map((b) => (
                            <motion.button
                              key={b.id}
                              onClick={() => onRunOutDismissedIdChange(b.id!)}
                              aria-pressed={runOutDismissedId === b.id}
                              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-150 ${
                                runOutDismissedId === b.id
                                  ? 'bg-cricket-red/20 text-cricket-red border-2 border-cricket-red/40'
                                  : 'bg-[var(--bg-input)] text-theme-secondary border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]'
                              }`}
                            >
                              {b.label}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-theme-muted font-semibold mb-2 text-center">Runs completed before run-out</p>
                        <div className="flex gap-2 justify-center">
                          {[0, 1, 2].map((r) => (
                            <motion.button
                              key={r}
                              onClick={() => onWicketRunOutRunsChange(r)}
                              aria-label={`${r} runs scored on run out`}
                              aria-pressed={wicketRunOutRuns === r}
                              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                              className={`w-12 h-12 min-w-0 min-h-0 rounded-xl text-lg font-bold transition-colors duration-150 ${
                                wicketRunOutRuns === r
                                  ? 'bg-cricket-red/20 text-cricket-red border-2 border-cricket-red/40'
                                  : 'bg-[var(--bg-input)] text-theme-secondary border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]'
                              }`}
                            >
                              {r}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <motion.button
                      onClick={onDismissalTypeClear}
                      aria-label="Go back to dismissal type selection"
                      whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                      className="flex-1 btn-outline text-sm flex items-center justify-center gap-1"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </motion.button>
                    <motion.button
                      onClick={() => onRecordWicket(
                        wicketDismissalType,
                        wicketRunOutRuns,
                        wicketDismissalType === 'run_out' ? (runOutDismissedId || undefined) : undefined,
                      )}
                      aria-label="Confirm wicket"
                      whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                      className="flex-1 btn-danger text-sm"
                    >
                      Confirm Wicket
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
