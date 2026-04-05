import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Plus,
  Calendar,
  ArrowLeft,
  ChevronRight,
  Users,
  X,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  TournamentDetail,
  PointsTableEntry,
  CreateTournamentInput,
  AddFixtureInput,
  TournamentFixture,
} from '../lib/api';

// ─── Tournament List ────────────────────────────────────────────────────────

function TournamentList() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tournaments', statusFilter],
    queryFn: () => api.getTournaments(statusFilter || undefined),
  });

  const tournaments = data?.data || [];

  const statusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return <span className="badge-live"><span className="w-1.5 h-1.5 rounded-full bg-cricket-green animate-pulse" />Live</span>;
      case 'upcoming':
        return <span className="badge-scheduled">Upcoming</span>;
      case 'completed':
        return <span className="badge-completed">Completed</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black tracking-tight text-theme-primary">Tournaments</h1>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreateForm(true)}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus size={16} />
          New Tournament
        </motion.button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { label: 'All', value: '' },
          { label: 'Live', value: 'live' },
          { label: 'Upcoming', value: 'upcoming' },
          { label: 'Completed', value: 'completed' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
              statusFilter === tab.value
                ? 'bg-cricket-green/15 text-cricket-green'
                : 'text-theme-tertiary hover:text-theme-primary hover:bg-[var(--bg-hover)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-24" style={{
              background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-16 h-16 rounded-2xl skeleton-subtle flex items-center justify-center mb-2"
          >
            <Trophy size={28} className="text-theme-muted" />
          </motion.div>
          <p className="text-theme-primary text-lg font-semibold">No tournaments yet</p>
          <p className="text-theme-tertiary text-sm">Create your first tournament to get started</p>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="space-y-3"
        >
          {tournaments.map((t) => (
            <motion.div
              key={t.id}
              variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            >
              <Link
                to={`/tournaments/${t.id}`}
                className="card card-hover flex items-center justify-between min-h-0 group"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-theme-primary font-bold text-base">{t.name}</h3>
                    {statusBadge(t.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-theme-tertiary">
                    <span className="uppercase font-semibold tracking-wider">{t.format}</span>
                    {t.startDate && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(t.startDate).toLocaleDateString()}
                        {t.endDate && ` - ${new Date(t.endDate).toLocaleDateString()}`}
                      </span>
                    )}
                    {t.organizer && <span>{t.organizer}</span>}
                  </div>
                </div>
                <ChevronRight size={18} className="text-theme-muted group-hover:text-theme-primary transition-colors" />
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create Tournament Modal */}
      <AnimatePresence>
        {showCreateForm && (
          <CreateTournamentModal onClose={() => setShowCreateForm(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Create Tournament Modal ────────────────────────────────────────────────

function CreateTournamentModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<CreateTournamentInput>({
    name: '',
    format: 't20',
    startDate: '',
    endDate: '',
    organizer: '',
    shortName: '',
    season: '',
  });

  const createMutation = useMutation({
    mutationFn: () => api.createTournament(form),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      navigate(`/tournaments/${data.id}`);
      onClose();
    },
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
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-theme-primary">Create Tournament</h2>
          <button onClick={onClose} className="btn-close w-8 h-8 rounded-lg flex items-center justify-center min-h-0 min-w-0">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Tournament Name *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Sunday League 2026"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Short Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. SL26"
                maxLength={30}
                value={form.shortName}
                onChange={(e) => setForm({ ...form, shortName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Season</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. 2026"
                value={form.season}
                onChange={(e) => setForm({ ...form, season: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Format *</label>
            <select
              className="input"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            >
              <option value="t20">T20</option>
              <option value="odi">ODI</option>
              <option value="test">Test</option>
              <option value="t10">T10</option>
              <option value="the_hundred">The Hundred</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Organizer</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Local Cricket Association"
              value={form.organizer}
              onChange={(e) => setForm({ ...form, organizer: e.target.value })}
            />
          </div>

          {/* Group stage config */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
            <p className="text-xs font-bold text-theme-tertiary uppercase tracking-widest mb-3">Group Stage Config</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-theme-muted font-semibold uppercase">Groups</label>
                <input
                  type="number"
                  className="input text-sm"
                  min={1}
                  max={8}
                  placeholder="2"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      groupStageConfig: { ...form.groupStageConfig, groups: parseInt(e.target.value) || undefined },
                    })
                  }
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted font-semibold uppercase">Teams/Group</label>
                <input
                  type="number"
                  className="input text-sm"
                  min={2}
                  max={20}
                  placeholder="5"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      groupStageConfig: { ...form.groupStageConfig, teamsPerGroup: parseInt(e.target.value) || undefined },
                    })
                  }
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted font-semibold uppercase">Win Pts</label>
                <input
                  type="number"
                  className="input text-sm"
                  min={0}
                  defaultValue={2}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      groupStageConfig: { ...form.groupStageConfig, pointsForWin: parseInt(e.target.value) || 2 },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => createMutation.mutate()}
            disabled={!form.name || createMutation.isPending}
            className="btn-primary w-full text-center disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Tournament'}
          </motion.button>

          {createMutation.isError && (
            <p className="text-cricket-red text-sm text-center">
              Failed to create tournament. Please try again.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Tournament Detail ──────────────────────────────────────────────────────

function TournamentDetailView() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'fixtures' | 'points' | 'bracket'>('fixtures');
  const [showAddFixture, setShowAddFixture] = useState(false);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.getTournament(id!),
    enabled: !!id,
  });

  const { data: pointsData } = useQuery({
    queryKey: ['points-table', id],
    queryFn: () => api.getPointsTable(id!),
    enabled: !!id && activeTab === 'points',
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="card h-32" style={{
            background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-theme-primary text-lg font-semibold">Tournament not found</p>
      </div>
    );
  }

  const statusBadge = () => {
    switch (tournament.status) {
      case 'live':
        return <span className="badge-live"><span className="w-1.5 h-1.5 rounded-full bg-cricket-green animate-pulse" />Live</span>;
      case 'upcoming':
        return <span className="badge-scheduled">Upcoming</span>;
      case 'completed':
        return <span className="badge-completed">Completed</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-4"
      >
        <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors min-h-0 min-w-0 py-1">
          <ArrowLeft size={16} />
          <span>All Tournaments</span>
        </Link>
      </motion.div>

      {/* Tournament header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card mb-6 gradient-strip-top"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-black tracking-tight text-theme-primary">{tournament.name}</h1>
              {statusBadge()}
            </div>
            <div className="flex items-center gap-4 text-sm text-theme-tertiary">
              <span className="uppercase font-bold tracking-wider text-xs">{tournament.format}</span>
              {tournament.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {new Date(tournament.startDate).toLocaleDateString()}
                  {tournament.endDate && ` - ${new Date(tournament.endDate).toLocaleDateString()}`}
                </span>
              )}
              {tournament.organizer && <span>{tournament.organizer}</span>}
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAddFixture(true)}
            className="btn-outline text-sm flex items-center gap-1.5"
          >
            <Plus size={14} />
            Add Fixture
          </motion.button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
        {(['fixtures', 'points', 'bracket'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${
              activeTab === tab
                ? 'bg-[var(--bg-card)] shadow-sm text-theme-primary'
                : 'text-theme-tertiary hover:text-theme-primary'
            }`}
          >
            {tab === 'fixtures' ? 'Fixtures' : tab === 'points' ? 'Points Table' : 'Bracket'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'fixtures' && (
          <motion.div key="fixtures" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FixturesList fixtures={tournament.fixtures || []} />
          </motion.div>
        )}
        {activeTab === 'points' && (
          <motion.div key="points" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PointsTable entries={pointsData?.pointsTable || []} />
          </motion.div>
        )}
        {activeTab === 'bracket' && (
          <motion.div key="bracket" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <KnockoutBracket fixtures={tournament.fixtures || []} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Fixture Modal */}
      <AnimatePresence>
        {showAddFixture && id && (
          <AddFixtureModal
            tournamentId={id}
            teams={tournament.teams || []}
            onClose={() => setShowAddFixture(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Fixtures List ──────────────────────────────────────────────────────────

function FixturesList({ fixtures }: { fixtures: TournamentFixture[] }) {
  if (fixtures.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-theme-tertiary text-sm">No fixtures scheduled yet</p>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
      className="space-y-3"
    >
      {fixtures.map((fixture) => (
        <motion.div
          key={fixture.id}
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
        >
          <Link
            to={`/matches/${fixture.id}/scorecard`}
            className="card card-hover flex items-center justify-between min-h-0"
          >
            <div className="flex-1">
              {fixture.matchNumber && (
                <span className="text-[10px] text-theme-muted font-bold uppercase tracking-widest">
                  Match {fixture.matchNumber}
                </span>
              )}
              <div className="flex items-center gap-3 mt-1">
                <span className="font-bold text-theme-primary">{fixture.homeTeamName}</span>
                <span className="text-theme-muted text-xs font-bold">vs</span>
                <span className="font-bold text-theme-primary">{fixture.awayTeamName}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-theme-tertiary mt-1">
                {fixture.venue && <span>{fixture.venue}</span>}
                {fixture.scheduledStart && (
                  <span>{new Date(fixture.scheduledStart).toLocaleDateString()}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              {fixture.status === 'completed' && fixture.resultSummary ? (
                <p className="text-sm text-cricket-green font-semibold">{fixture.resultSummary}</p>
              ) : fixture.currentScore ? (
                <p className="text-lg font-bold text-theme-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fixture.currentScore}
                  <span className="text-xs text-theme-tertiary ml-1">({fixture.currentOvers} ov)</span>
                </p>
              ) : (
                <span className="badge-scheduled">Scheduled</span>
              )}
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Points Table ───────────────────────────────────────────────────────────

function PointsTable({ entries }: { entries: PointsTableEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-theme-tertiary text-sm">No completed matches to compute standings</p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-theme-muted uppercase tracking-widest" style={{ background: 'linear-gradient(90deg, rgba(22, 163, 74, 0.04), transparent)' }}>
            <th className="text-left py-3 pr-4 font-semibold rounded-l-lg pl-3">#</th>
            <th className="text-left py-3 pr-4 font-semibold">Team</th>
            <th className="text-center py-3 w-10 font-semibold">P</th>
            <th className="text-center py-3 w-10 font-semibold">W</th>
            <th className="text-center py-3 w-10 font-semibold">L</th>
            <th className="text-center py-3 w-10 font-semibold">D</th>
            <th className="text-center py-3 w-10 font-semibold">NR</th>
            <th className="text-center py-3 w-16 font-semibold">NRR</th>
            <th className="text-center py-3 w-12 font-semibold rounded-r-lg">Pts</th>
          </tr>
        </thead>
        <motion.tbody
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
        >
          {entries.map((entry, idx) => (
            <motion.tr
              key={entry.teamId}
              variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
              className="table-row-border transition-colors"
            >
              <td className="py-3 pl-3 text-theme-muted font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {idx + 1}
              </td>
              <td className="py-3 pr-4">
                <span className="font-semibold text-theme-primary">{entry.teamName}</span>
              </td>
              <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{entry.played}</td>
              <td className="text-center text-cricket-green font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{entry.won}</td>
              <td className="text-center text-cricket-red font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{entry.lost}</td>
              <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{entry.drawn}</td>
              <td className="text-center text-theme-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{entry.noResult}</td>
              <td className={`text-center font-semibold ${entry.nrr >= 0 ? 'text-cricket-green' : 'text-cricket-red'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {entry.nrr >= 0 ? '+' : ''}{entry.nrr.toFixed(3)}
              </td>
              <td className="text-center font-black text-theme-primary text-base" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {entry.points}
              </td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}

// ─── Knockout Bracket ───────────────────────────────────────────────────────

const KNOCKOUT_STAGES = ['quarter_final', 'semi_final', 'final'] as const;
const STAGE_LABELS: Record<string, string> = {
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  final: 'Final',
  eliminator: 'Eliminator',
  qualifier: 'Qualifier',
};

function KnockoutBracket({ fixtures }: { fixtures: TournamentFixture[] }) {
  // Filter knockout fixtures based on status text in fixture or infer from matchNumber
  // For simplicity, show all fixtures in a bracket-like tree layout
  const knockoutFixtures = fixtures.filter(
    (f) => f.matchNumber && f.matchNumber > (fixtures.length * 0.6) // rough heuristic
  );

  // If no obvious knockout fixtures, show all in a bracket style
  const displayFixtures = knockoutFixtures.length > 0 ? knockoutFixtures : fixtures;

  if (displayFixtures.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-theme-tertiary text-sm">No knockout fixtures available</p>
      </div>
    );
  }

  // Simple bracket: split into rounds based on count
  const totalFixtures = displayFixtures.length;
  const rounds: TournamentFixture[][] = [];

  if (totalFixtures >= 4) {
    // QF, SF, Final
    const qfCount = Math.min(4, Math.floor(totalFixtures / 2));
    rounds.push(displayFixtures.slice(0, qfCount));
    const sfCount = Math.min(2, Math.floor(qfCount / 2));
    rounds.push(displayFixtures.slice(qfCount, qfCount + sfCount));
    if (displayFixtures.length > qfCount + sfCount) {
      rounds.push(displayFixtures.slice(qfCount + sfCount, qfCount + sfCount + 1));
    }
  } else {
    // Just show as single round
    rounds.push(displayFixtures);
  }

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-stretch gap-8 min-w-[600px] py-4">
        {rounds.map((round, roundIdx) => (
          <div key={roundIdx} className="flex flex-col justify-around gap-4 flex-1">
            <p className="text-[10px] font-bold text-theme-muted uppercase tracking-widest text-center mb-2">
              {roundIdx === rounds.length - 1
                ? 'Final'
                : roundIdx === rounds.length - 2
                ? 'Semi Finals'
                : 'Quarter Finals'}
            </p>
            {round.map((fixture) => (
              <motion.div
                key={fixture.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl p-3 relative"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--bg-input-border)',
                }}
              >
                {/* Connector lines */}
                {roundIdx < rounds.length - 1 && (
                  <div
                    className="absolute top-1/2 -right-4 w-4 h-px"
                    style={{ background: 'var(--border-medium)' }}
                  />
                )}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-bold text-theme-primary truncate">
                    {fixture.homeTeamName}
                  </span>
                  {fixture.status === 'completed' && fixture.resultSummary?.includes(fixture.homeTeamName) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cricket-green" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-theme-primary truncate">
                    {fixture.awayTeamName}
                  </span>
                  {fixture.status === 'completed' && fixture.resultSummary?.includes(fixture.awayTeamName) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cricket-green" />
                  )}
                </div>
                {fixture.resultSummary && (
                  <p className="text-[10px] text-cricket-green font-semibold mt-1.5 truncate">
                    {fixture.resultSummary}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Scorer Assignment ──────────────────────────────────────────────────────

export function ScorerAssignment({ matchId, currentScorers = [] }: { matchId: string; currentScorers?: string[] }) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');

  const assignMutation = useMutation({
    mutationFn: (userId: string) => api.assignScorer(matchId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      setSelectedUserId('');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => api.revokeScorer(matchId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match', matchId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Users size={16} className="text-theme-tertiary" />
        <span className="text-xs font-bold text-theme-tertiary uppercase tracking-widest">
          Scorers ({currentScorers.length}/2)
        </span>
        {currentScorers.length === 2 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cricket-green/10 text-cricket-green font-bold">
            Dual Scorer
          </span>
        )}
      </div>

      {/* Current scorers */}
      {currentScorers.map((userId) => (
        <div
          key={userId}
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--bg-input-border)' }}
        >
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-cricket-green" />
            <span className="text-sm font-medium text-theme-primary">{userId}</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => revokeMutation.mutate(userId)}
            className="text-cricket-red hover:bg-cricket-red/10 p-1.5 rounded-lg transition-colors min-h-0 min-w-0"
            title="Revoke scorer access"
          >
            <UserMinus size={16} />
          </motion.button>
        </div>
      ))}

      {/* Add scorer */}
      {currentScorers.length < 2 && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder="Enter scorer user ID..."
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          />
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => selectedUserId && assignMutation.mutate(selectedUserId)}
            disabled={!selectedUserId || assignMutation.isPending}
            className="btn-primary text-sm min-w-[90px] disabled:opacity-50"
          >
            Assign
          </motion.button>
        </div>
      )}

      {assignMutation.isError && (
        <p className="text-cricket-red text-xs">Failed to assign scorer</p>
      )}
    </div>
  );
}

// ─── Add Fixture Modal ──────────────────────────────────────────────────────

function AddFixtureModal({
  tournamentId,
  teams,
  onClose,
}: {
  tournamentId: string;
  teams: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: formatConfigs } = useQuery({
    queryKey: ['format-configs'],
    queryFn: () => api.getMatches(), // We'll use a simple approach
  });

  const [form, setForm] = useState<AddFixtureInput>({
    homeTeamId: '',
    awayTeamId: '',
    formatConfigId: '',
    matchNumber: undefined,
    venue: '',
    scheduledStart: '',
  });

  const mutation = useMutation({
    mutationFn: () => api.addFixture(tournamentId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      onClose();
    },
  });

  // If no teams in tournament, fetch all teams
  const { data: allTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.getTeams(),
    enabled: teams.length === 0,
  });

  const teamOptions = teams.length > 0 ? teams : (allTeams || []);

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
        className="card w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-theme-primary">Add Fixture</h2>
          <button onClick={onClose} className="btn-close w-8 h-8 rounded-lg flex items-center justify-center min-h-0 min-w-0">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Home Team *</label>
            <select
              className="input"
              value={form.homeTeamId}
              onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })}
            >
              <option value="">Select team...</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Away Team *</label>
            <select
              className="input"
              value={form.awayTeamId}
              onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })}
            >
              <option value="">Select team...</option>
              {teamOptions
                .filter((t) => t.id !== form.homeTeamId)
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="label">Format Config ID *</label>
            <input
              type="text"
              className="input"
              placeholder="Format config UUID"
              value={form.formatConfigId}
              onChange={(e) => setForm({ ...form, formatConfigId: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Match #</label>
              <input
                type="number"
                className="input"
                min={1}
                value={form.matchNumber || ''}
                onChange={(e) => setForm({ ...form, matchNumber: parseInt(e.target.value) || undefined })}
              />
            </div>
            <div>
              <label className="label">Venue</label>
              <input
                type="text"
                className="input"
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Scheduled Start</label>
            <input
              type="datetime-local"
              className="input"
              value={form.scheduledStart}
              onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => mutation.mutate()}
            disabled={!form.homeTeamId || !form.awayTeamId || !form.formatConfigId || mutation.isPending}
            className="btn-primary w-full text-center disabled:opacity-50"
          >
            {mutation.isPending ? 'Adding...' : 'Add Fixture'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main exported page ─────────────────────────────────────────────────────

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();

  if (id) {
    return <TournamentDetailView />;
  }

  return <TournamentList />;
}
