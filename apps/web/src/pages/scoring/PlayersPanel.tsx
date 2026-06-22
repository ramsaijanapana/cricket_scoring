import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import { itemVariants } from './animationVariants';

interface PlayersPanelProps {
  reduceMotion: boolean;
  striker: any;
  nonStriker: any;
  strikerStats: { runs: number; balls: number; fours: number; sixes: number };
  nonStrikerStats: { runs: number; balls: number; fours: number; sixes: number };
  getPlayerName: (entry: any, fallback: string) => string;
  calcSR: (runs: number, balls: number) => string;
  selectStriker: (id: string) => void;
  swapStrike: () => void;
  currentBowlerName: string;
  bowlerStats: { overs: string; maidens: number; runs: number; wickets: number } | null;
  calcEcon: (runs: number, overs: string | number) => string;
  showBowlerSelect: boolean;
  setShowBowlerSelect: (v: boolean) => void;
  pendingBowlerChange: boolean;
  bowlingXi: string[];
  bowlingScorecard: any[];
  allPlayerNames: Record<string, string>;
  currentBowlerId: string | null;
  lastOverBowlerId: string | null;
  changeBowler: (id: string) => void;
}

function BatsmanCard({
  entry, label, stats, fallback, xOffset, borderClass, reduceMotion, getPlayerName, calcSR, onSelect,
}: {
  entry: any; label: string; stats: { runs: number; balls: number; fours: number; sixes: number };
  fallback: string; xOffset: number; borderClass: string; reduceMotion: boolean;
  getPlayerName: (entry: any, fallback: string) => string;
  calcSR: (runs: number, balls: number) => string;
  onSelect: () => void;
}) {
  return (
    <motion.button
      className={`card p-3 text-left min-h-0 ${borderClass}`}
      onClick={onSelect}
      initial={reduceMotion ? undefined : { opacity: 0, x: xOffset }}
      animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {label === 'Striker' && <span className="striker-dot" />}
        <span className={`text-[10px] font-bold uppercase tracking-widest ${label === 'Striker' ? 'text-cricket-green' : 'text-theme-tertiary'}`}>{label}</span>
      </div>
      <p className="text-sm font-bold text-theme-primary truncate mb-1.5">{getPlayerName(entry, fallback)}</p>
      <p className="text-lg font-extrabold text-theme-primary tabular-nums leading-none">
        {stats.runs}
        <span className="text-xs text-theme-tertiary font-medium ml-1">({stats.balls})</span>
      </p>
      <div className="flex gap-2.5 mt-2 text-[10px] text-theme-muted font-medium tabular-nums">
        <span>4s: <span className="text-cricket-green">{stats.fours}</span></span>
        <span>6s: <span className="text-cricket-purple">{stats.sixes}</span></span>
        <span>SR: <span className="text-theme-secondary">{calcSR(stats.runs, stats.balls)}</span></span>
      </div>
    </motion.button>
  );
}

export function PlayersPanel({
  reduceMotion, striker, nonStriker, strikerStats, nonStrikerStats,
  getPlayerName, calcSR, selectStriker, swapStrike, currentBowlerName, bowlerStats,
  calcEcon, showBowlerSelect, setShowBowlerSelect, pendingBowlerChange, bowlingXi,
  bowlingScorecard, allPlayerNames, currentBowlerId, lastOverBowlerId, changeBowler,
}: PlayersPanelProps) {
  return (
    <>
      <motion.div className="relative" variants={reduceMotion ? undefined : itemVariants}>
        <div className="grid grid-cols-2 gap-2">
          <BatsmanCard
            entry={striker} label="Striker" stats={strikerStats} fallback="Batsman 1"
            xOffset={-10} borderClass="border-l-2 border-l-cricket-green"
            reduceMotion={reduceMotion} getPlayerName={getPlayerName} calcSR={calcSR}
            onSelect={() => striker?.playerId && selectStriker(striker.playerId)}
          />
          <BatsmanCard
            entry={nonStriker} label="Non-Striker" stats={nonStrikerStats} fallback="Batsman 2"
            xOffset={10} borderClass=""
            reduceMotion={reduceMotion} getPlayerName={getPlayerName} calcSR={calcSR}
            onSelect={() => nonStriker?.playerId && selectStriker(nonStriker.playerId)}
          />
        </div>
        <motion.button
          onClick={swapStrike}
          whileTap={reduceMotion ? undefined : { scale: 0.85, rotate: 180 }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 min-w-0 min-h-0 rounded-full bg-[var(--bg-card)] border border-[var(--border-medium)] shadow-sm flex items-center justify-center text-theme-tertiary hover:text-cricket-green hover:border-cricket-green/40 transition-colors"
          aria-label="Swap striker and non-striker"
          title="Swap strike"
        >
          <ArrowLeftRight size={12} />
        </motion.button>
      </motion.div>

      <motion.div className="card p-3 relative" variants={reduceMotion ? undefined : itemVariants}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest">Bowler</span>
            <p className="text-sm font-bold text-theme-primary mt-0.5">{currentBowlerName}</p>
          </div>
          <div className="flex items-center gap-3">
            {bowlerStats && (
              <div className="flex gap-3 text-xs font-semibold text-theme-secondary tabular-nums">
                <span>{bowlerStats.overs}-{bowlerStats.maidens}-{bowlerStats.runs}-{bowlerStats.wickets}</span>
                <span className="text-theme-tertiary">Econ <span className="text-theme-secondary">{calcEcon(bowlerStats.runs, bowlerStats.overs)}</span></span>
              </div>
            )}
            <motion.button
              onClick={() => setShowBowlerSelect(!showBowlerSelect)}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="w-7 h-7 min-w-0 min-h-0 rounded-lg flex items-center justify-center text-theme-tertiary hover:text-theme-primary hover:bg-[var(--bg-hover)] transition-colors"
              aria-label="Change bowler"
            >
              <ChevronDown size={14} className={`transition-transform duration-200 ${showBowlerSelect ? 'rotate-180' : ''}`} />
            </motion.button>
          </div>
        </div>
        <AnimatePresence>
          {showBowlerSelect && (
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                <p className="text-[10px] font-bold text-theme-tertiary uppercase tracking-widest mb-2">
                  {pendingBowlerChange ? 'Select New Bowler (over change)' : 'Select Bowler'}
                </p>
                {pendingBowlerChange && <p className="text-[10px] text-cricket-gold mb-2">Same bowler cannot bowl consecutive overs</p>}
                <div className="flex flex-wrap gap-1.5">
                  {bowlingXi.map((playerId) => {
                    const bowlerEntry = bowlingScorecard.find((b: any) => b.playerId === playerId);
                    const name = bowlerEntry?.playerName || allPlayerNames[playerId] || 'Bowler';
                    const isActive = playerId === currentBowlerId;
                    const isDisabled = pendingBowlerChange && playerId === lastOverBowlerId;
                    return (
                      <motion.button
                        key={playerId}
                        onClick={() => !isDisabled && changeBowler(playerId)}
                        whileTap={reduceMotion || isDisabled ? undefined : { scale: 0.95 }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                          isDisabled ? 'opacity-30 cursor-not-allowed surface-muted line-through'
                            : isActive ? 'bg-cricket-green/15 text-cricket-green border border-cricket-green/30' : 'surface-interactive'
                        }`}
                        aria-disabled={isDisabled}
                      >
                        {name}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
