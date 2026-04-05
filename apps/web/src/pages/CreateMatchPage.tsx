import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const FORMATS = [
  { value: 't20', label: 'T20', overs: 20 },
  { value: 'odi', label: 'ODI', overs: 50 },
  { value: 'test', label: 'Test', overs: null },
  { value: 't10', label: 'T10', overs: 10 },
  { value: 'hundred', label: 'The Hundred', overs: null },
  { value: 'custom', label: 'Custom', overs: null },
];

export function CreateMatchPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [format, setFormat] = useState('t20');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const teamA = await api.createTeam({ name: teamAName || 'Team A', teamType: 'club' });
      const teamB = await api.createTeam({ name: teamBName || 'Team B', teamType: 'club' });

      return api.createMatch({
        formatConfigId: format, // will be resolved to actual config ID by server
        venue,
        city,
        homeTeamId: teamA.id,
        awayTeamId: teamB.id,
        homePlayingXi: [],
        awayPlayingXi: [],
      });
    },
    onSuccess: (match) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      navigate(`/matches/${match.id}/score`);
    },
  });

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Match</h1>

      {/* Format */}
      <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
        Format
      </label>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFormat(f.value)}
            className={`py-3 rounded-lg font-bold text-sm transition-all ${
              format === f.value
                ? 'bg-cricket-green text-white'
                : 'bg-surface-800 text-surface-300 border border-surface-700 hover:border-surface-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Venue */}
      <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
        Venue
      </label>
      <input
        type="text"
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        placeholder="e.g., Wankhede Stadium"
        className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100
                   placeholder:text-surface-600 focus:outline-none focus:border-cricket-green mb-4"
      />

      <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
        City
      </label>
      <input
        type="text"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="e.g., Mumbai"
        className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100
                   placeholder:text-surface-600 focus:outline-none focus:border-cricket-green mb-6"
      />

      {/* Teams */}
      <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
        Team A
      </label>
      <input
        type="text"
        value={teamAName}
        onChange={(e) => setTeamAName(e.target.value)}
        placeholder="Team name"
        className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100
                   placeholder:text-surface-600 focus:outline-none focus:border-cricket-green mb-4"
      />

      <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
        Team B
      </label>
      <input
        type="text"
        value={teamBName}
        onChange={(e) => setTeamBName(e.target.value)}
        placeholder="Team name"
        className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100
                   placeholder:text-surface-600 focus:outline-none focus:border-cricket-green mb-8"
      />

      {/* Submit */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="btn-primary w-full text-lg disabled:opacity-50"
      >
        {mutation.isPending ? 'Creating...' : 'Create Match'}
      </button>

      {mutation.isError && (
        <p className="text-cricket-red text-sm mt-3 text-center">
          {(mutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
