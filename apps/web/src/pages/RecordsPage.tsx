import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Target, Users, Swords } from 'lucide-react';
import { api } from '../lib/api';

type RecordTab = 'batting' | 'bowling' | 'team' | 'match';
type FormatFilter = 'all' | 'T20' | 'ODI' | 'Test';

const TABS: { key: RecordTab; label: string; icon: React.ReactNode }[] = [
  { key: 'batting', label: 'Batting', icon: <Swords size={13} /> },
  { key: 'bowling', label: 'Bowling', icon: <Target size={13} /> },
  { key: 'team', label: 'Team', icon: <Users size={13} /> },
  { key: 'match', label: 'Match', icon: <Trophy size={13} /> },
];

const FORMATS: FormatFilter[] = ['all', 'T20', 'ODI', 'Test'];

export function RecordsPage() {
  const [activeTab, setActiveTab] = useState<RecordTab>('batting');
  const [format, setFormat] = useState<FormatFilter>('all');

  const formatParams: Record<string, string> | undefined =
    format !== 'all' ? { format } : undefined;

  const { data: battingData, isLoading: battingLoading } = useQuery({
    queryKey: ['records-batting', format],
    queryFn: () => api.getRecordsBatting(formatParams),
    enabled: activeTab === 'batting' || activeTab === 'team' || activeTab === 'match',
  });

  const { data: bowlingData, isLoading: bowlingLoading } = useQuery({
    queryKey: ['records-bowling', format],
    queryFn: () => api.getRecordsBowling(formatParams),
    enabled: activeTab === 'bowling',
  });

  const battingRecords = battingData?.data || [];
  const bowlingRecords = bowlingData?.data || [];

  // Derived records from batting data
  const highestScores = [...battingRecords].sort((a, b) => b.totalRuns - a.totalRuns).slice(0, 10);
  const mostRuns = highestScores; // same sort for career runs
  const highestAverages = [...battingRecords]
    .filter((r) => r.innings >= 3)
    .sort((a, b) => b.average - a.average)
    .slice(0, 10);
  const mostCenturies = [...battingRecords]
    .filter((r) => r.totalRuns >= 100)
    .sort((a, b) => b.totalRuns - a.totalRuns)
    .slice(0, 10);
  const fastestFifties = [...battingRecords]
    .filter((r) => r.strikeRate > 0)
    .sort((a, b) => b.strikeRate - a.strikeRate)
    .slice(0, 10);

  // Derived records from bowling data
  const mostWickets = [...bowlingRecords].sort((a, b) => b.totalWickets - a.totalWickets).slice(0, 10);
  const bestEconomy = [...bowlingRecords]
    .filter((r) => r.innings >= 3 && r.economy > 0)
    .sort((a, b) => a.economy - b.economy)
    .slice(0, 10);
  const bestAverage = [...bowlingRecords]
    .filter((r) => r.totalWickets >= 3 && r.average > 0)
    .sort((a, b) => a.average - b.average)
    .slice(0, 10);

  const isLoading = activeTab === 'bowling' ? bowlingLoading : battingLoading;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto"
    >
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="card mb-6 text-center py-6 relative overflow-hidden gradient-strip-top"
      >
        <div className="relative z-10">
          <h1 className="text-theme-primary text-xl font-black tracking-tight flex items-center justify-center gap-2">
            <Trophy size={20} className="text-cricket-gold" />
            All-Time Records
          </h1>
          <p className="text-theme-tertiary text-sm mt-1">
            Top performances across all matches
          </p>
        </div>
      </motion.div>

      {/* Format filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] font-bold text-theme-muted uppercase tracking-widest">Format:</span>
        {FORMATS.map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all min-h-0 min-w-0 ${
              format === f
                ? 'bg-cricket-green text-white'
                : 'surface-interactive'
            }`}
          >
            {f === 'all' ? 'All Formats' : f}
          </button>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--bg-hover)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-[var(--bg-card)] text-theme-primary shadow-sm'
                : 'text-theme-tertiary hover:text-theme-secondary'
            }`}
            aria-pressed={activeTab === tab.key}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {[1, 2].map((i) => (
              <div key={i} className="card">
                <div
                  className="h-5 rounded-lg w-1/3 mb-4"
                  style={{
                    background:
                      'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                  }}
                />
                {[1, 2, 3, 4, 5].map((j) => (
                  <div
                    key={j}
                    className="h-4 rounded-lg mb-2"
                    style={{
                      background:
                        'linear-gradient(90deg, var(--border-subtle) 25%, var(--bg-hover) 50%, var(--border-subtle) 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s ease-in-out infinite',
                      animationDelay: `${j * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            ))}
          </motion.div>
        ) : activeTab === 'batting' ? (
          <motion.div
            key="batting-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <RecordSection title="Most Runs (Career)" subtitle="Highest career run aggregates">
              <RankedTable
                rows={mostRuns}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'totalRuns', label: 'Runs', bold: true },
                  { key: 'innings', label: 'Inn' },
                  { key: 'average', label: 'Avg' },
                  { key: 'strikeRate', label: 'SR' },
                ]}
              />
            </RecordSection>

            <RecordSection title="Highest Averages" subtitle="Min 3 innings">
              <RankedTable
                rows={highestAverages}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'average', label: 'Avg', bold: true },
                  { key: 'totalRuns', label: 'Runs' },
                  { key: 'innings', label: 'Inn' },
                ]}
              />
            </RecordSection>

            <RecordSection title="Fastest Scoring Rates" subtitle="By career strike rate">
              <RankedTable
                rows={fastestFifties}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'strikeRate', label: 'SR', bold: true },
                  { key: 'totalRuns', label: 'Runs' },
                  { key: 'totalBalls', label: 'Balls' },
                ]}
              />
            </RecordSection>
          </motion.div>
        ) : activeTab === 'bowling' ? (
          <motion.div
            key="bowling-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <RecordSection title="Most Wickets" subtitle="Highest career wicket takers">
              <RankedTable
                rows={mostWickets}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'totalWickets', label: 'Wkts', bold: true },
                  { key: 'innings', label: 'Inn' },
                  { key: 'economy', label: 'Econ' },
                  { key: 'average', label: 'Avg' },
                ]}
              />
            </RecordSection>

            <RecordSection title="Best Economy Rates" subtitle="Min 3 innings">
              <RankedTable
                rows={bestEconomy}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'economy', label: 'Econ', bold: true },
                  { key: 'totalWickets', label: 'Wkts' },
                  { key: 'totalRunsConceded', label: 'Runs' },
                  { key: 'innings', label: 'Inn' },
                ]}
              />
            </RecordSection>

            <RecordSection title="Best Bowling Averages" subtitle="Min 3 wickets">
              <RankedTable
                rows={bestAverage}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'average', label: 'Avg', bold: true },
                  { key: 'totalWickets', label: 'Wkts' },
                  { key: 'economy', label: 'Econ' },
                ]}
              />
            </RecordSection>
          </motion.div>
        ) : activeTab === 'team' ? (
          <motion.div
            key="team-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <RecordSection title="Highest Team Totals" subtitle="Highest cumulative scores by player contributions">
              <RankedTable
                rows={highestScores}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'totalRuns', label: 'Runs', bold: true },
                  { key: 'innings', label: 'Inn' },
                  { key: 'strikeRate', label: 'SR' },
                ]}
              />
            </RecordSection>
          </motion.div>
        ) : (
          <motion.div
            key="match-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <RecordSection title="Highest Match Aggregates" subtitle="Top run scorers across matches">
              <RankedTable
                rows={highestScores}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => playerName(r) },
                  { key: 'totalRuns', label: 'Runs', bold: true },
                  { key: 'innings', label: 'Inn' },
                  { key: 'average', label: 'Avg' },
                  { key: 'strikeRate', label: 'SR' },
                ]}
              />
            </RecordSection>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function playerName(row: any): string {
  const first = row.playerFirstName || '';
  const last = row.playerLastName || '';
  return `${first} ${last}`.trim() || `Player ${row.playerId?.slice(0, 6) || '?'}`;
}

interface Column {
  key: string;
  label: string;
  bold?: boolean;
  render?: (row: any) => string;
}

function RecordSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 250, damping: 22 }}
      className="card relative overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={14} className="text-cricket-gold" />
        <div>
          <h2 className="text-theme-primary text-sm font-bold">{title}</h2>
          <p className="text-theme-muted text-[11px]">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function RankedTable({ rows, columns }: { rows: any[]; columns: Column[] }) {
  if (!rows.length) {
    return (
      <p className="text-theme-muted text-xs text-center py-6">
        No records available yet
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-[10px] text-theme-muted uppercase tracking-widest"
            style={{
              background: 'linear-gradient(90deg, rgba(22, 163, 74, 0.04), transparent)',
            }}
          >
            <th className="text-center py-2.5 w-10 font-semibold rounded-l-lg">#</th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-2.5 font-semibold ${
                  col.key === 'name' ? 'text-left pr-4' : 'text-center w-16'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <motion.tr
              key={row.playerId || idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 25,
                delay: idx * 0.02,
              }}
              className="table-row-border transition-colors"
            >
              <td className="text-center py-3">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                    idx === 0
                      ? 'bg-cricket-gold/15 text-cricket-gold'
                      : idx === 1
                        ? 'bg-gray-300/15 text-theme-secondary'
                        : idx === 2
                          ? 'bg-orange-400/15 text-orange-400'
                          : 'text-theme-muted'
                  }`}
                >
                  {idx + 1}
                </span>
              </td>
              {columns.map((col) => {
                const value = col.render ? col.render(row) : row[col.key];
                return (
                  <td
                    key={col.key}
                    className={`py-3 ${
                      col.key === 'name'
                        ? 'text-left pr-4 font-semibold text-theme-primary text-[13px]'
                        : `text-center ${col.bold ? 'font-bold text-theme-primary' : 'text-theme-secondary'}`
                    }`}
                    style={{ fontVariantNumeric: col.key !== 'name' ? 'tabular-nums' : undefined }}
                  >
                    {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value ?? '-'}
                  </td>
                );
              })}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
