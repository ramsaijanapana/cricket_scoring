import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function ScorecardPage() {
  const { id: matchId } = useParams<{ id: string }>();

  const { data: scorecard, isLoading } = useQuery({
    queryKey: ['scorecard', matchId],
    queryFn: () => api.getScorecard(matchId!),
    enabled: !!matchId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-surface-400">Loading scorecard...</p>
      </div>
    );
  }

  if (!scorecard?.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-surface-400">No innings data yet</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {scorecard.map((inningsData: any, idx: number) => (
        <InningsScorecard key={idx} data={inningsData} inningsNumber={idx + 1} />
      ))}
    </div>
  );
}

function InningsScorecard({ data, inningsNumber }: { data: any; inningsNumber: number }) {
  const ordinal = ['', '1st', '2nd', '3rd', '4th'][inningsNumber] || `${inningsNumber}th`;

  return (
    <div className="card">
      {/* Innings header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-surface-700">
        <span className="text-xs font-bold text-surface-400 uppercase tracking-widest">
          {ordinal} Innings
        </span>
        <span className="text-2xl font-extrabold">
          {data.innings.totalRuns}/{data.innings.totalWickets}
          <span className="text-sm font-normal text-surface-400 ml-1.5">
            ({data.innings.totalOvers} ov)
          </span>
        </span>
      </div>

      {/* Batting table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-surface-500 uppercase tracking-wider">
              <th className="text-left py-2 pr-4 font-semibold">Batter</th>
              <th className="text-center py-2 w-10 font-semibold">R</th>
              <th className="text-center py-2 w-10 font-semibold">B</th>
              <th className="text-center py-2 w-10 font-semibold">4s</th>
              <th className="text-center py-2 w-10 font-semibold">6s</th>
              <th className="text-center py-2 w-14 font-semibold">SR</th>
            </tr>
          </thead>
          <tbody>
            {data.batting
              .filter((b: any) => !b.didNotBat)
              .map((batter: any) => (
                <tr key={batter.id} className="border-t border-surface-700/40">
                  <td className="py-2.5 pr-4">
                    <p className="font-semibold text-surface-100">
                      Player #{batter.battingPosition}
                    </p>
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      {batter.isOut
                        ? batter.dismissalText || batter.dismissalType?.replace(/_/g, ' ')
                        : 'not out'}
                    </p>
                  </td>
                  <td className={`text-center font-bold ${
                    batter.runsScored >= 100 ? 'text-cricket-gold' :
                    batter.runsScored >= 50 ? 'text-cricket-green' : ''
                  }`}>
                    {batter.runsScored}{!batter.isOut ? '*' : ''}
                  </td>
                  <td className="text-center text-surface-300">{batter.ballsFaced}</td>
                  <td className={`text-center ${batter.fours > 0 ? 'text-cricket-green' : 'text-surface-500'}`}>
                    {batter.fours}
                  </td>
                  <td className={`text-center ${batter.sixes > 0 ? 'text-purple-400' : 'text-surface-500'}`}>
                    {batter.sixes}
                  </td>
                  <td className="text-center text-surface-300">{batter.strikeRate || '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Extras */}
      <div className="flex justify-between items-center py-2.5 border-t border-surface-700 mt-2 text-sm">
        <span className="text-surface-400 font-semibold">Extras</span>
        <span className="text-surface-200 font-semibold">{data.extras.total}</span>
      </div>

      {/* Bowling table */}
      <div className="overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-surface-500 uppercase tracking-wider">
              <th className="text-left py-2 pr-4 font-semibold">Bowler</th>
              <th className="text-center py-2 w-10 font-semibold">O</th>
              <th className="text-center py-2 w-10 font-semibold">M</th>
              <th className="text-center py-2 w-10 font-semibold">R</th>
              <th className="text-center py-2 w-10 font-semibold">W</th>
              <th className="text-center py-2 w-14 font-semibold">Econ</th>
            </tr>
          </thead>
          <tbody>
            {data.bowling.map((bowler: any) => (
              <tr key={bowler.id} className="border-t border-surface-700/40">
                <td className="py-2.5 pr-4">
                  <p className="font-semibold text-surface-100">
                    Bowler #{bowler.bowlingPosition || '?'}
                  </p>
                </td>
                <td className="text-center text-surface-300">{bowler.oversBowled}</td>
                <td className="text-center text-surface-300">{bowler.maidens}</td>
                <td className="text-center text-surface-300">{bowler.runsConceded}</td>
                <td className={`text-center font-bold ${
                  bowler.wicketsTaken >= 5 ? 'text-cricket-gold' :
                  bowler.wicketsTaken > 0 ? 'text-cricket-red' : 'text-surface-500'
                }`}>
                  {bowler.wicketsTaken}
                </td>
                <td className="text-center text-surface-300">{bowler.economyRate || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
