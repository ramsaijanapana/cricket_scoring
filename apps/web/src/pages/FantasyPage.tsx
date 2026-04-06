import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trophy, Users, Plus, ChevronRight, X, Star } from 'lucide-react';
import { api } from '../lib/api';

interface Contest {
  id: string;
  name: string;
  description?: string;
  status: string;
  entryFee: number;
  maxEntries?: number;
  startsAt?: string;
  lockTime?: string;
}

interface LeaderboardEntry {
  teamId: string;
  userId: string;
  teamName?: string;
  totalPoints: number;
  rank?: number;
  displayName?: string;
}

type FantasyTab = 'contests' | 'my-contests';

export function FantasyPage() {
  const [activeTab, setActiveTab] = useState<FantasyTab>('contests');
  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [showCreateTeam, setShowCreateTeam] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-4"
      >
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors min-h-0 min-w-0 py-1">
          <ArrowLeft size={16} />
          <span>Back</span>
        </Link>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-black tracking-tight text-theme-primary mb-6 flex items-center gap-2"
      >
        <Trophy size={24} className="text-cricket-gold" />
        Fantasy Cricket
      </motion.h1>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--bg-hover)' }}>
        <button
          onClick={() => setActiveTab('contests')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === 'contests'
              ? 'bg-[var(--bg-card)] text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-secondary'
          }`}
        >
          All Contests
        </button>
        <button
          onClick={() => setActiveTab('my-contests')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === 'my-contests'
              ? 'bg-[var(--bg-card)] text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-secondary'
          }`}
        >
          My Contests
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'contests' ? (
          <motion.div
            key="contests"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ContestList
              onSelectContest={setSelectedContestId}
              onCreateTeam={setShowCreateTeam}
            />
          </motion.div>
        ) : (
          <motion.div
            key="my-contests"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MyContests />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leaderboard modal */}
      <AnimatePresence>
        {selectedContestId && (
          <LeaderboardModal
            contestId={selectedContestId}
            onClose={() => setSelectedContestId(null)}
          />
        )}
      </AnimatePresence>

      {/* Create team modal */}
      <AnimatePresence>
        {showCreateTeam && (
          <CreateTeamModal
            contestId={showCreateTeam}
            onClose={() => setShowCreateTeam(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ContestList({
  onSelectContest,
  onCreateTeam,
}: {
  onSelectContest: (id: string) => void;
  onCreateTeam: (id: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['fantasy-contests'],
    queryFn: () => api.getFantasyContests(),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="card h-24 animate-pulse" style={{ background: 'var(--bg-hover)' }} />
        ))}
      </div>
    );
  }

  const contests: Contest[] = data?.data || [];

  if (contests.length === 0) {
    return (
      <div className="text-center py-16">
        <Trophy size={32} className="text-theme-muted mx-auto mb-3" />
        <p className="text-theme-secondary font-semibold">No contests available</p>
        <p className="text-theme-tertiary text-sm mt-1">Check back later for upcoming contests</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contests.map((contest) => (
        <motion.div
          key={contest.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-theme-primary">{contest.name}</h3>
              {contest.description && (
                <p className="text-xs text-theme-tertiary mt-0.5">{contest.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-theme-muted">
                <span className={`px-2 py-0.5 rounded-full font-semibold ${
                  contest.status === 'open' ? 'bg-cricket-green/10 text-cricket-green' :
                  contest.status === 'live' ? 'bg-cricket-red/10 text-cricket-red' :
                  'bg-gray-500/10 text-gray-500'
                }`}>
                  {contest.status}
                </span>
                {contest.entryFee > 0 && <span>Entry: {contest.entryFee} pts</span>}
                {contest.maxEntries && <span>Max {contest.maxEntries} entries</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {contest.status === 'open' && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onCreateTeam(contest.id)}
                  className="btn-primary text-xs flex items-center gap-1"
                >
                  <Plus size={14} />
                  Join
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelectContest(contest.id)}
                className="btn-outline text-xs flex items-center gap-1"
              >
                <Users size={14} />
                Leaderboard
              </motion.button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function MyContests() {
  const { data, isLoading } = useQuery({
    queryKey: ['fantasy-my-contests'],
    queryFn: () => api.getMyFantasyContests(),
  });

  if (isLoading) {
    return <div className="card h-24 animate-pulse" style={{ background: 'var(--bg-hover)' }} />;
  }

  const entries = data?.data || [];

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Star size={32} className="text-theme-muted mx-auto mb-3" />
        <p className="text-theme-secondary font-semibold">No entries yet</p>
        <p className="text-theme-tertiary text-sm mt-1">Join a contest to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry: any) => (
        <motion.div
          key={entry.teamId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-theme-primary">
                {entry.contestName}
              </h3>
              <p className="text-xs text-theme-tertiary mt-0.5">
                Team: {entry.teamName || 'Unnamed'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-theme-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {entry.totalPoints?.toFixed(1) ?? '0.0'}
              </p>
              {entry.rank && (
                <p className="text-xs text-theme-muted">Rank #{entry.rank}</p>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function LeaderboardModal({ contestId, onClose }: { contestId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['fantasy-leaderboard', contestId],
    queryFn: () => api.getFantasyLeaderboard(contestId),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="card w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-cricket-gold" />
            <h2 className="text-lg font-bold text-theme-primary">
              {data?.contest?.name || 'Leaderboard'}
            </h2>
          </div>
          <button onClick={onClose} className="btn-close w-8 h-8 rounded-lg flex items-center justify-center min-h-0 min-w-0">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-hover)' }} />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-theme-muted uppercase tracking-widest">
                  <th className="text-left py-2 font-semibold">#</th>
                  <th className="text-left py-2 font-semibold">Team</th>
                  <th className="text-right py-2 font-semibold">Points</th>
                </tr>
              </thead>
              <tbody>
                {(data?.leaderboard || []).map((entry: LeaderboardEntry, idx: number) => (
                  <tr key={entry.teamId} className="table-row-border">
                    <td className="py-2.5 w-8">
                      <span className={`text-xs font-bold ${
                        idx === 0 ? 'text-cricket-gold' :
                        idx === 1 ? 'text-gray-400' :
                        idx === 2 ? 'text-amber-700' : 'text-theme-muted'
                      }`}>
                        {entry.rank || idx + 1}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <p className="font-semibold text-theme-primary text-[13px]">
                        {entry.teamName || 'Unnamed Team'}
                      </p>
                      <p className="text-[11px] text-theme-tertiary">
                        {entry.displayName || 'Unknown'}
                      </p>
                    </td>
                    <td className="py-2.5 text-right font-bold text-theme-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {entry.totalPoints?.toFixed(1) ?? '0.0'}
                    </td>
                  </tr>
                ))}
                {(!data?.leaderboard || data.leaderboard.length === 0) && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-theme-muted text-sm">
                      No entries yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateTeamModal({ contestId, onClose }: { contestId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const BUDGET = 100;
  const TEAM_SIZE = 11;
  const COST_PER_PLAYER = 9; // simple flat cost for MVP

  const { data: playersData } = useQuery({
    queryKey: ['players'],
    queryFn: () => api.getPlayers(),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.submitFantasyTeam(contestId, {
        teamName: teamName || undefined,
        players: selectedPlayers,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fantasy-my-contests'] });
      onClose();
    },
  });

  const players: any[] = Array.isArray(playersData) ? playersData : (playersData as any)?.data || [];
  const budgetUsed = selectedPlayers.length * COST_PER_PLAYER;
  const budgetRemaining = BUDGET - budgetUsed;

  const togglePlayer = (id: string) => {
    setSelectedPlayers(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : prev.length < TEAM_SIZE ? [...prev, id] : prev,
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="card w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-theme-primary">Create Fantasy Team</h2>
          <button onClick={onClose} className="btn-close w-8 h-8 rounded-lg flex items-center justify-center min-h-0 min-w-0">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="label">Team Name</label>
          <input
            type="text"
            className="input"
            placeholder="My Dream XI"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="text-theme-secondary font-semibold">
            Selected: {selectedPlayers.length}/{TEAM_SIZE}
          </span>
          <span className={`font-bold ${budgetRemaining < 0 ? 'text-cricket-red' : 'text-cricket-green'}`}>
            Budget: {budgetRemaining}/{BUDGET}
          </span>
        </div>

        <div className="overflow-y-auto flex-1 space-y-1 mb-4">
          {players.map((p: any) => {
            const isSelected = selectedPlayers.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePlayer(p.id)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all text-sm ${
                  isSelected
                    ? 'bg-cricket-green/10 border border-cricket-green/30'
                    : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="font-medium text-theme-primary">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-xs text-theme-muted">{COST_PER_PLAYER} pts</span>
              </button>
            );
          })}
          {players.length === 0 && (
            <p className="text-center text-theme-muted text-sm py-8">No players available</p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => submitMutation.mutate()}
            disabled={selectedPlayers.length !== TEAM_SIZE || budgetRemaining < 0 || submitMutation.isPending}
            className={`btn-primary flex-1 ${
              selectedPlayers.length !== TEAM_SIZE || budgetRemaining < 0 ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit Team'}
          </motion.button>
        </div>

        {submitMutation.isError && (
          <p className="text-cricket-red text-xs mt-2 text-center">
            {(submitMutation.error as any)?.message || 'Failed to submit team'}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
