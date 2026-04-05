import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, ChevronLeft, ChevronRight, Check, Users } from 'lucide-react';
import { api, type MatchDetail, type MatchTeamInfo } from '../lib/api';

interface TossWizardProps {
  matchId: string;
  matchData: MatchDetail;
}

type WizardStep = 'toss_winner' | 'toss_decision' | 'confirm_xi';

const STEPS: WizardStep[] = ['toss_winner', 'toss_decision', 'confirm_xi'];
const STEP_LABELS: Record<WizardStep, string> = {
  toss_winner: 'Toss Winner',
  toss_decision: 'Bat or Field',
  confirm_xi: 'Playing XI',
};

export function TossWizard({ matchId, matchData }: TossWizardProps) {
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;

  const teams: MatchTeamInfo[] = matchData.teams || [];
  const [step, setStep] = useState<WizardStep>('toss_winner');
  const [tossWinnerId, setTossWinnerId] = useState<string | null>(null);
  const [tossDecision, setTossDecision] = useState<'bat' | 'field' | null>(null);

  const stepIndex = STEPS.indexOf(step);

  // Derive batting/bowling team from toss
  const tossWinner = teams.find((t) => t.teamId === tossWinnerId);
  const tossLoser = teams.find((t) => t.teamId !== tossWinnerId);

  const battingTeamId =
    tossDecision === 'bat' ? tossWinnerId : tossLoser?.teamId;
  const bowlingTeamId =
    tossDecision === 'bat' ? tossLoser?.teamId : tossWinnerId;

  // Record toss + start match
  const tossMutation = useMutation({
    mutationFn: async () => {
      if (!tossWinnerId || !tossDecision || !battingTeamId || !bowlingTeamId) {
        throw new Error('Toss data incomplete');
      }
      // Step 1: Record toss
      await api.recordToss(matchId, {
        winner_id: tossWinnerId,
        decision: tossDecision,
      });
      // Step 2: Start match
      const battingTeam = teams.find((t) => t.teamId === battingTeamId);
      return api.startMatch(matchId, {
        battingTeamId,
        bowlingTeamId,
        battingOrder: battingTeam?.playingXi || [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
  });

  const canGoNext = () => {
    if (step === 'toss_winner') return !!tossWinnerId;
    if (step === 'toss_decision') return !!tossDecision;
    return true;
  };

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const slideVariants = reduceMotion
    ? { enter: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -30 },
        initial: { opacity: 0, x: 30 },
      };

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      {/* Header card */}
      <div className="card text-center py-8 mb-6 relative overflow-hidden gradient-strip-top">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(22, 163, 74, 0.06), transparent 60%)' }} />
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-full bg-cricket-gold/15 border-2 border-cricket-gold/30 flex items-center justify-center mx-auto mb-4">
            <Coins size={24} className="text-cricket-gold" />
          </div>
          <h2 className="text-xl font-extrabold text-theme-primary mb-1">Match Setup</h2>
          <p className="text-theme-tertiary text-sm">
            {matchData.venue}{matchData.city ? ` · ${matchData.city}` : ''}
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="font-bold text-theme-primary">{teams[0]?.teamName || 'Home'}</span>
            <span className="text-theme-muted text-xs font-bold">VS</span>
            <span className="font-bold text-theme-primary">{teams[1]?.teamName || 'Away'}</span>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors duration-300 ${
                i < stepIndex
                  ? 'bg-cricket-green/20 text-cricket-green border border-cricket-green/30'
                  : i === stepIndex
                  ? 'bg-cricket-gold/20 text-cricket-gold border-2 border-cricket-gold/40'
                  : 'bg-[var(--bg-hover)] text-theme-muted border border-[var(--border-subtle)]'
              }`}
            >
              {i < stepIndex ? <Check size={12} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-8 h-0.5 rounded-full transition-colors duration-300 ${
                  i < stepIndex ? 'bg-cricket-green/40' : 'bg-[var(--border-subtle)]'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <p className="label text-center mb-4">{STEP_LABELS[step]}</p>

      {/* Step content */}
      <AnimatePresence mode="wait">
        {step === 'toss_winner' && (
          <motion.div
            key="toss_winner"
            initial={reduceMotion ? undefined : { opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="flex flex-col gap-3"
          >
            <p className="text-center text-theme-tertiary text-sm mb-1">Who won the toss?</p>
            {teams.map((t) => (
              <button
                key={t.teamId}
                onClick={() => setTossWinnerId(t.teamId)}
                className={`card text-center py-6 cursor-pointer transition-all duration-200 ${
                  tossWinnerId === t.teamId
                    ? 'border-2 border-cricket-green/40 bg-cricket-green/5 shadow-glow-green'
                    : 'card-hover'
                }`}
                aria-pressed={tossWinnerId === t.teamId}
              >
                <p className="text-lg font-bold text-theme-primary">{t.teamName}</p>
                <p className="text-xs text-theme-tertiary mt-1 uppercase tracking-widest">{t.designation}</p>
              </button>
            ))}
          </motion.div>
        )}

        {step === 'toss_decision' && (
          <motion.div
            key="toss_decision"
            initial={reduceMotion ? undefined : { opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="flex flex-col gap-3"
          >
            <p className="text-center text-theme-tertiary text-sm mb-1">
              <span className="font-semibold text-theme-primary">{tossWinner?.teamName}</span> won the toss and elected to...
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTossDecision('bat')}
                className={`card text-center py-8 cursor-pointer transition-all duration-200 ${
                  tossDecision === 'bat'
                    ? 'border-2 border-cricket-green/40 bg-cricket-green/5 shadow-glow-green'
                    : 'card-hover'
                }`}
                aria-pressed={tossDecision === 'bat'}
              >
                <p className="text-2xl font-extrabold text-theme-primary">Bat</p>
                <p className="text-[10px] text-theme-tertiary mt-1 uppercase tracking-widest">First</p>
              </button>
              <button
                onClick={() => setTossDecision('field')}
                className={`card text-center py-8 cursor-pointer transition-all duration-200 ${
                  tossDecision === 'field'
                    ? 'border-2 border-cricket-green/40 bg-cricket-green/5 shadow-glow-green'
                    : 'card-hover'
                }`}
                aria-pressed={tossDecision === 'field'}
              >
                <p className="text-2xl font-extrabold text-theme-primary">Field</p>
                <p className="text-[10px] text-theme-tertiary mt-1 uppercase tracking-widest">First</p>
              </button>
            </div>
          </motion.div>
        )}

        {step === 'confirm_xi' && (
          <motion.div
            key="confirm_xi"
            initial={reduceMotion ? undefined : { opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="flex flex-col gap-4"
          >
            <p className="text-center text-theme-tertiary text-sm mb-1">
              Confirm Playing XI for both teams
            </p>

            {teams.map((team) => {
              const isBatting = team.teamId === battingTeamId;
              return (
                <div key={team.teamId} className="card p-4 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={14} className={isBatting ? 'text-cricket-green' : 'text-cricket-blue'} />
                    <span className="text-sm font-bold text-theme-primary">{team.teamName}</span>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        isBatting
                          ? 'bg-cricket-green/10 text-cricket-green'
                          : 'bg-cricket-blue/10 text-cricket-blue'
                      }`}
                    >
                      {isBatting ? 'Batting' : 'Fielding'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {(team.playingXi || []).map((playerId, idx) => {
                      const name = team.playerNames?.[playerId] || `Player ${idx + 1}`;
                      return (
                        <div key={playerId} className="flex items-center gap-2 py-1">
                          <span className="text-[10px] font-bold text-theme-muted tabular-nums w-4 text-right">
                            {idx + 1}
                          </span>
                          <span className="text-xs text-theme-secondary truncate">{name}</span>
                        </div>
                      );
                    })}
                    {(!team.playingXi || team.playingXi.length === 0) && (
                      <p className="text-xs text-theme-muted col-span-2 py-2">No players configured</p>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-6">
        {stepIndex > 0 && (
          <motion.button
            onClick={goBack}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            className="flex-1 btn-outline text-sm flex items-center justify-center gap-1"
          >
            <ChevronLeft size={16} />
            Back
          </motion.button>
        )}
        {stepIndex < STEPS.length - 1 ? (
          <motion.button
            onClick={goNext}
            disabled={!canGoNext()}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-1 disabled:opacity-40"
          >
            Next
            <ChevronRight size={16} />
          </motion.button>
        ) : (
          <motion.button
            onClick={() => tossMutation.mutate()}
            disabled={tossMutation.isPending}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {tossMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Starting...
              </>
            ) : (
              <>
                <Check size={16} />
                Start Match
              </>
            )}
          </motion.button>
        )}
      </div>

      {tossMutation.isError && (
        <div className="mt-4 p-3 rounded-xl bg-cricket-red/10 border border-cricket-red/20 animate-scale-in">
          <p className="text-cricket-red text-sm text-center font-medium">
            {(tossMutation.error as Error).message}
          </p>
        </div>
      )}
    </div>
  );
}
