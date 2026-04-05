import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function HomePage() {
  const { data: matches, isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: api.getMatches,
  });

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Matches</h1>
        <Link to="/matches/new" className="btn-primary text-sm">
          + New Match
        </Link>
      </div>

      {/* Match list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-surface-400">Loading matches...</p>
        </div>
      ) : !matches?.length ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-surface-200 text-lg font-semibold">No matches yet</p>
          <p className="text-surface-400 text-sm">Create your first match to start scoring</p>
        </div>
      ) : (
        <div className="grid gap-3 mobile-l:grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3">
          {matches.map((match: any) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: any }) {
  const statusColors: Record<string, string> = {
    live: 'text-cricket-green bg-cricket-green/10',
    completed: 'text-surface-400 bg-surface-700',
    scheduled: 'text-cricket-blue bg-cricket-blue/10',
    rain_delay: 'text-cricket-gold bg-cricket-gold/10',
    innings_break: 'text-cricket-gold bg-cricket-gold/10',
    abandoned: 'text-cricket-red bg-cricket-red/10',
  };

  return (
    <div className="card hover:border-surface-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-surface-100 truncate">
            {match.venue || 'Venue TBD'}
          </p>
          {match.city && (
            <p className="text-xs text-surface-400 mt-0.5">{match.city}</p>
          )}
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
            statusColors[match.status] || statusColors.scheduled
          }`}
        >
          {match.status.replace('_', ' ')}
        </span>
      </div>

      {match.result_summary && (
        <p className="text-sm text-surface-300 mb-3">{match.result_summary}</p>
      )}

      <div className="flex gap-2 mt-auto">
        <Link
          to={`/matches/${match.id}/score`}
          className="btn-primary flex-1 text-center text-sm py-2"
        >
          Score
        </Link>
        <Link
          to={`/matches/${match.id}/scorecard`}
          className="btn-outline flex-1 text-center text-sm py-2"
        >
          Scorecard
        </Link>
      </div>
    </div>
  );
}
