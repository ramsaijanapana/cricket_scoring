import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, ArrowLeft, BarChart3, MessageSquare, Download, History, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { CommentaryFeed } from '../components/CommentaryFeed';
import { MatchChat } from '../components/MatchChat';
import { AuditLogPanel } from '../components/AuditLogPanel';

const inningsContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const inningsCardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 250, damping: 22 },
  },
};

const battingRowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 25 },
  },
};

const battingTableVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.02 } },
};

const bowlingTableVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.02 } },
};

type ScorecardTab = 'scorecard' | 'commentary' | 'audit';

export function ScorecardPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<ScorecardTab>('scorecard');
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: scorecard, isLoading } = useQuery({
    queryKey: ['scorecard', matchId],
    queryFn: () => api.getScorecard(matchId!),
    enabled: !!matchId,
  });

  const { data: matchData } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.getMatch(matchId!),
    enabled: !!matchId,
  });

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        {[1, 2].map((i) => (
          <div key={i} className="card">
            <div
              className="h-6 rounded-lg w-1/4 mb-4"
              style={{
                background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((j) => (
                <div
                  key={j}
                  className="h-4 rounded-lg"
                  style={{
                    background: 'linear-gradient(90deg, var(--border-subtle) 25%, var(--bg-hover) 50%, var(--border-subtle) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    animationDelay: `${j * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </motion.div>
    );
  }

  if (!scorecard?.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="flex flex-col items-center justify-center py-24 gap-3"
      >
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-16 h-16 rounded-2xl skeleton-subtle flex items-center justify-center mb-2"
        >
          <ClipboardList size={28} className="text-theme-muted" />
        </motion.div>
        <p className="text-theme-primary text-lg font-semibold">No innings data yet</p>
        <p className="text-theme-tertiary text-sm">Scorecard will appear once the match begins</p>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Link to={`/matches/${matchId}/score`} className="btn-primary text-sm mt-3 inline-block">
            Go to Scoring
          </Link>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto"
    >
      {/* Back button + PDF download */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="mb-4 flex items-center"
      >
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors min-h-0 min-w-0 py-1">
          <ArrowLeft size={16} />
          <span>Back to Matches</span>
        </Link>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          disabled={pdfLoading}
          onClick={async () => {
            if (!matchId) return;
            setPdfLoading(true);
            try {
              const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
              const res = await fetch(`${API_BASE}/matches/${matchId}/scorecard/pdf`);
              if (!res.ok) throw new Error('Failed to generate PDF');
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const team1 = matchData?.teams?.[0]?.teamName || 'Team1';
              const team2 = matchData?.teams?.[1]?.teamName || 'Team2';
              const filename = `${team1}_vs_${team2}_scorecard.pdf`.replace(/\s+/g, '_');
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (err) {
              console.error('PDF download failed:', err);
            } finally {
              setPdfLoading(false);
            }
          }}
          className="btn-outline text-sm flex items-center gap-1.5 ml-auto no-print"
          data-no-print
        >
          {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {pdfLoading ? 'Generating...' : 'Download PDF'}
        </motion.button>
      </motion.div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
        <span
          className="flex-1 text-center text-sm font-semibold py-2.5 rounded-lg bg-cricket-green text-white min-h-0"
          style={{ cursor: 'default' }}
        >
          Scorecard
        </span>
        <Link
          to={`/matches/${matchId}/analytics`}
          className="flex-1 text-center text-sm font-semibold py-2.5 rounded-lg text-theme-tertiary hover:text-theme-primary transition-colors min-h-0 flex items-center justify-center gap-1.5"
        >
          <BarChart3 size={14} />
          Analytics
        </Link>
      </div>

      {/* Match header */}
      {matchData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="card mb-6 text-center py-8 relative overflow-hidden gradient-strip-top"
        >
          {/* Subtle radial glow behind the header */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(22, 163, 74, 0.06), transparent 60%)' }} />
          <div className="relative z-10">
            <div className="flex items-center justify-center gap-6 mb-1">
              <motion.span
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
                className="text-theme-primary text-xl font-black tracking-tight"
              >
                {matchData.teams?.[0]?.teamName || 'Home'}
              </motion.span>
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.15 }}
                className="text-theme-muted text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: 'var(--bg-hover)' }}
              >
                VS
              </motion.span>
              <motion.span
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
                className="text-theme-primary text-xl font-black tracking-tight"
              >
                {matchData.teams?.[1]?.teamName || 'Away'}
              </motion.span>
            </div>
            <p className="text-theme-tertiary text-xs mt-2">
              {matchData.venue}{matchData.city ? ` · ${matchData.city}` : ''}
            </p>
            {matchData.resultSummary && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-cricket-green text-sm font-semibold mt-3 inline-block px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(22, 163, 74, 0.08)' }}
              >
                {matchData.resultSummary}
              </motion.p>
            )}
          </div>
        </motion.div>
      )}

      {/* Tab switcher: Scorecard | Commentary | Audit Log */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--bg-hover)' }}>
        <button
          onClick={() => setActiveTab('scorecard')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            activeTab === 'scorecard'
              ? 'bg-[var(--bg-card)] text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-secondary'
          }`}
          aria-pressed={activeTab === 'scorecard'}
        >
          <BarChart3 size={13} />
          Scorecard
        </button>
        <button
          onClick={() => setActiveTab('commentary')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            activeTab === 'commentary'
              ? 'bg-[var(--bg-card)] text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-secondary'
          }`}
          aria-pressed={activeTab === 'commentary'}
        >
          <MessageSquare size={13} />
          Commentary
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            activeTab === 'audit'
              ? 'bg-[var(--bg-card)] text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-secondary'
          }`}
          aria-pressed={activeTab === 'audit'}
        >
          <History size={13} />
          Audit Log
        </button>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'scorecard' ? (
          <motion.div
            key="scorecard-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Innings scorecards */}
            <motion.div
              variants={inningsContainerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {scorecard.map((inningsData: any, idx: number) => (
                <motion.div key={idx} variants={inningsCardVariants}>
                  <InningsScorecard data={inningsData} inningsNumber={idx + 1} />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        ) : activeTab === 'commentary' ? (
          <motion.div
            key="commentary-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-4 pb-3 divider">
                <MessageSquare size={14} className="text-cricket-green" />
                <span className="text-sm font-bold text-theme-primary">Ball-by-Ball Commentary</span>
              </div>
              <CommentaryFeed matchId={matchId!} />
            </div>
          </motion.div>
        ) : activeTab === 'audit' ? (
          <motion.div
            key="audit-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-4 pb-3 divider">
                <History size={14} className="text-cricket-gold" />
                <span className="text-sm font-bold text-theme-primary">Undo & Correction History</span>
              </div>
              <AuditLogPanel matchId={matchId!} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Match Chat */}
      {matchId && <MatchChat matchId={matchId} />}
    </motion.div>
  );
}

function InningsScorecard({ data, inningsNumber }: { data: any; inningsNumber: number }) {
  const ordinal = ['', '1st', '2nd', '3rd', '4th'][inningsNumber] || `${inningsNumber}th`;

  const activeBatters = data.batting.filter((b: any) => !b.didNotBat);

  return (
    <div className="card relative overflow-hidden gradient-strip-top">
      {/* Innings header */}
      <div className="flex items-center justify-between mb-5 pb-4 divider">
        <div>
          <span className="text-[11px] font-bold text-theme-tertiary uppercase tracking-widest">
            {ordinal} Innings
          </span>
          <p className="text-theme-primary font-bold text-lg mt-0.5">
            {data.battingTeamName || 'Batting'}
          </p>
        </div>
        <div className="text-right">
          <AnimatePresence mode="wait">
            <motion.span
              key={`${data.innings.totalRuns}/${data.innings.totalWickets}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-4xl font-black tracking-tight inline-block score-big"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {data.innings.totalRuns}/{data.innings.totalWickets}
            </motion.span>
          </AnimatePresence>
          <span className="text-sm font-medium text-theme-tertiary ml-2">
            ({data.innings.totalOvers} ov)
          </span>
        </div>
      </div>

      {/* Batting table */}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-theme-muted uppercase tracking-widest" style={{ background: 'linear-gradient(90deg, rgba(22, 163, 74, 0.04), transparent)' }}>
              <th className="text-left py-2.5 pr-4 font-semibold rounded-l-lg pl-2">Batter</th>
              <th className="text-center py-2.5 w-11 font-semibold">R</th>
              <th className="text-center py-2.5 w-10 font-semibold">B</th>
              <th className="text-center py-2.5 w-10 font-semibold">4s</th>
              <th className="text-center py-2.5 w-10 font-semibold">6s</th>
              <th className="text-center py-2.5 w-14 font-semibold rounded-r-lg">SR</th>
            </tr>
          </thead>
          <motion.tbody
            variants={battingTableVariants}
            initial="hidden"
            animate="visible"
          >
            {activeBatters.map((batter: any) => {
              const isMilestone = batter.runsScored >= 50;
              const isCentury = batter.runsScored >= 100;
              const milestoneStyle = isCentury
                ? { borderLeft: '3px solid #16a34a' }
                : isMilestone
                ? { borderLeft: '3px solid #eab308' }
                : {};
              return (
                <motion.tr
                  key={batter.id}
                  variants={battingRowVariants}
                  className={`table-row-border transition-colors${isMilestone ? ' milestone-glow' : ''}`}
                  style={milestoneStyle}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-theme-primary text-[13px]">
                      {batter.playerName || `Player #${batter.battingPosition}`}
                    </p>
                    <p className="text-[11px] text-theme-tertiary mt-0.5">
                      {batter.isOut
                        ? batter.dismissalText || batter.dismissalType?.replace(/_/g, ' ') || 'out'
                        : 'not out'}
                    </p>
                  </td>
                  <td className={`text-center font-bold ${
                    batter.runsScored >= 100 ? 'text-cricket-gold' :
                    batter.runsScored >= 50 ? 'text-cricket-green' : 'text-theme-primary'
                  }`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {batter.runsScored}{!batter.isOut ? '*' : ''}
                  </td>
                  <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{batter.ballsFaced}</td>
                  <td className={`text-center ${batter.fours > 0 ? 'text-cricket-green' : 'text-theme-muted'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {batter.fours}
                  </td>
                  <td className={`text-center ${batter.sixes > 0 ? 'text-purple-400' : 'text-theme-muted'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {batter.sixes}
                  </td>
                  <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {batter.strikeRate ? Number(batter.strikeRate).toFixed(1) : '-'}
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>

      {/* Did not bat */}
      {data.batting.some((b: any) => b.didNotBat) && (
        <div className="pt-2 pb-1 text-xs text-theme-muted">
          <span className="font-semibold text-theme-tertiary">Did not bat: </span>
          {data.batting
            .filter((b: any) => b.didNotBat)
            .map((b: any) => b.playerName || `Player #${b.battingPosition}`)
            .join(', ')}
        </div>
      )}

      {/* Extras */}
      <div className="flex justify-between items-center py-3 divider mt-2 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-theme-tertiary font-semibold text-xs uppercase tracking-wider">Extras</span>
          <div className="flex items-center gap-1 flex-wrap">
            {data.extras.wides > 0 && (
              <span className="extra-chip" style={{ background: 'rgba(234, 179, 8, 0.1)', color: 'var(--color-gold)' }}>W {data.extras.wides}</span>
            )}
            {data.extras.noBalls > 0 && (
              <span className="extra-chip" style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>NB {data.extras.noBalls}</span>
            )}
            {data.extras.byes > 0 && (
              <span className="extra-chip" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-blue)' }}>B {data.extras.byes}</span>
            )}
            {data.extras.legByes > 0 && (
              <span className="extra-chip" style={{ background: 'rgba(20, 184, 166, 0.1)', color: '#14b8a6' }}>LB {data.extras.legByes}</span>
            )}
            {data.extras.penalty > 0 && (
              <span className="extra-chip" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-red)' }}>P {data.extras.penalty}</span>
            )}
          </div>
        </div>
        <span className="text-theme-primary font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{data.extras.total}</span>
      </div>

      {/* Total */}
      <div className="flex justify-between items-center py-3 divider text-sm">
        <span className="text-theme-secondary font-bold text-xs uppercase tracking-wider">Total</span>
        <span className="text-theme-primary font-bold text-base" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {data.innings.totalRuns}/{data.innings.totalWickets}
          <span className="text-theme-tertiary font-normal text-sm ml-1.5">({data.innings.totalOvers} ov)</span>
        </span>
      </div>

      {/* Fall of wickets */}
      {data.fallOfWickets && data.fallOfWickets.length > 0 && (
        <div className="mt-3 rounded-xl p-4" style={{ background: 'var(--bg-hover)' }}>
          <p className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mb-2.5">Fall of Wickets</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-theme-secondary">
            {data.fallOfWickets.map((fow: any, i: number) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(239, 68, 68, 0.06)' }}
              >
                <span className="text-theme-muted">{fow.wicketNumber}/</span>
                <span className="text-cricket-red font-bold">{fow.inningsScore}</span>
                <span className="text-theme-tertiary ml-0.5">({fow.playerName}, {fow.overNumber} ov)</span>
              </motion.span>
            ))}
          </div>
        </div>
      )}

      {/* Bowling table */}
      <div className="overflow-x-auto -mx-5 px-5 mt-5">
        <p className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mb-2">
          Bowling — {data.bowlingTeamName || 'Bowling'}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-theme-muted uppercase tracking-widest" style={{ background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.04), transparent)' }}>
              <th className="text-left py-2.5 pr-4 font-semibold rounded-l-lg pl-2">Bowler</th>
              <th className="text-center py-2.5 w-10 font-semibold">O</th>
              <th className="text-center py-2.5 w-10 font-semibold">M</th>
              <th className="text-center py-2.5 w-10 font-semibold">R</th>
              <th className="text-center py-2.5 w-10 font-semibold">W</th>
              <th className="text-center py-2.5 w-14 font-semibold rounded-r-lg">Econ</th>
            </tr>
          </thead>
          <motion.tbody
            variants={bowlingTableVariants}
            initial="hidden"
            animate="visible"
          >
            {data.bowling.filter((bowler: any) => parseFloat(bowler.oversBowled) > 0 || bowler.runsConceded > 0 || bowler.wicketsTaken > 0).map((bowler: any) => (
              <motion.tr
                key={bowler.id}
                variants={battingRowVariants}
                className="table-row-border transition-colors"
              >
                <td className="py-3 pr-4">
                  <p className="font-semibold text-theme-primary text-[13px]">
                    {bowler.playerName || `Bowler #${bowler.bowlingPosition || '?'}`}
                  </p>
                </td>
                <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{bowler.oversBowled}</td>
                <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{bowler.maidens}</td>
                <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{bowler.runsConceded}</td>
                <td className={`text-center font-bold ${
                  bowler.wicketsTaken >= 5 ? 'text-cricket-gold' :
                  bowler.wicketsTaken > 0 ? 'text-cricket-red' : 'text-theme-muted'
                }`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {bowler.wicketsTaken}
                </td>
                <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {bowler.economyRate ? Number(bowler.economyRate).toFixed(1) : '-'}
                </td>
              </motion.tr>
            ))}
            {data.bowling.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-theme-muted text-xs">
                  No bowling data yet
                </td>
              </tr>
            )}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}
