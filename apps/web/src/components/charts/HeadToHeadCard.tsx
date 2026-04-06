import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';

interface PlayerOption {
  id: string;
  name: string;
}

interface HeadToHeadCardProps {
  batsmen: PlayerOption[];
  bowlers: PlayerOption[];
}

export function HeadToHeadCard({ batsmen, bowlers }: HeadToHeadCardProps) {
  const [selectedBatsman, setSelectedBatsman] = useState('');
  const [selectedBowler, setSelectedBowler] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['head-to-head', selectedBatsman, selectedBowler],
    queryFn: () => api.getHeadToHead(selectedBatsman, selectedBowler),
    enabled: !!selectedBatsman && !!selectedBowler,
  });

  return (
    <div className="space-y-4">
      {/* Player selectors */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mb-1.5 block">
            Batsman
          </label>
          <select
            value={selectedBatsman}
            onChange={(e) => setSelectedBatsman(e.target.value)}
            className="w-full text-sm rounded-lg py-2 px-3 text-theme-primary transition-colors"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <option value="">Select batsman</option>
            {batsmen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-2 text-theme-muted text-xs font-bold">VS</div>
        <div className="flex-1">
          <label className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mb-1.5 block">
            Bowler
          </label>
          <select
            value={selectedBowler}
            onChange={(e) => setSelectedBowler(e.target.value)}
            className="w-full text-sm rounded-lg py-2 px-3 text-theme-primary transition-colors"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <option value="">Select bowler</option>
            {bowlers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {!selectedBatsman || !selectedBowler ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-theme-muted text-xs">Select both players to see head-to-head stats</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div
            className="h-4 w-32 rounded-lg"
            style={{
              background:
                'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
        </div>
      ) : data ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="grid grid-cols-3 gap-3"
        >
          <StatCell label="Balls" value={data.balls} />
          <StatCell label="Runs" value={data.runs} highlight />
          <StatCell label="Dismissals" value={data.dismissals} danger={data.dismissals > 0} />
          <StatCell label="Dot Ball %" value={`${data.dotBallPct.toFixed(1)}%`} />
          <StatCell label="Boundary %" value={`${data.boundaryPct.toFixed(1)}%`} />
          <StatCell label="Avg R/B" value={data.avgRunsPerBall.toFixed(2)} />
        </motion.div>
      ) : null}
    </div>
  );
}

function StatCell({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-hover)' }}>
      <p className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mb-1">{label}</p>
      <p
        className={`text-lg font-black ${
          danger
            ? 'text-cricket-red'
            : highlight
              ? 'text-cricket-green'
              : 'text-theme-primary'
        }`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  );
}
