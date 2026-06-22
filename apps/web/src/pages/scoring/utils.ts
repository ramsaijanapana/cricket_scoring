import type { BallDisplay } from '../../stores/scoring-store';
import type { ExtrasMode } from './types';

export function toBallDisplay(runs: number, extras: ExtrasMode, isWicket: boolean): BallDisplay {
  if (isWicket) return { label: 'W', type: 'wicket' };
  if (extras === 'wide') return { label: `Wd${runs > 0 ? '+' + runs : ''}`, type: 'wide' };
  if (extras === 'noball') return { label: `Nb${runs > 0 ? '+' + runs : ''}`, type: 'noball' };
  if (extras === 'bye') return { label: `B${runs}`, type: 'bye' };
  if (extras === 'legbye') return { label: `Lb${runs}`, type: 'legbye' };
  if (runs === 0) return { label: '0', type: 'dot' };
  if (runs === 4) return { label: '4', type: 'four' };
  if (runs === 6) return { label: '6', type: 'six' };
  return { label: String(runs), type: 'run' };
}

export function getPlayerName(entry: any, fallback: string, allPlayerNames: Record<string, string>) {
  if (!entry) return fallback;
  return entry.playerName || entry.player_name || allPlayerNames[entry.playerId] || fallback;
}

export function getBatStats(entry: any) {
  return {
    runs: entry?.runs ?? entry?.runsScored ?? 0,
    balls: entry?.balls ?? entry?.ballsFaced ?? 0,
    fours: entry?.fours ?? 0,
    sixes: entry?.sixes ?? 0,
  };
}

export function calcSR(runs: number, balls: number) {
  return balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';
}

export function getBowlStats(entry: any) {
  return {
    overs: entry?.overs ?? entry?.oversBowled ?? '0.0',
    maidens: entry?.maidens ?? 0,
    runs: entry?.runsConceded ?? entry?.runs ?? 0,
    wickets: entry?.wickets ?? 0,
  };
}

export function calcEcon(runs: number, overs: string | number) {
  const o = typeof overs === 'string' ? parseFloat(overs) : overs;
  if (!o || o === 0) return '0.00';
  const completedOvers = Math.floor(o);
  const partialBalls = Math.round((o - completedOvers) * 10);
  const totalBalls = completedOvers * 6 + partialBalls;
  return totalBalls > 0 ? ((runs / totalBalls) * 6).toFixed(2) : '0.00';
}

export function buildDeliveryDescription(runs: number, extras: ExtrasMode, isWicket: boolean): string {
  if (isWicket) return 'Wicket!';
  const parts: string[] = [];
  if (extras !== 'normal') {
    const names: Record<ExtrasMode, string> = {
      normal: '', wide: 'Wide', noball: 'No Ball', bye: 'Bye', legbye: 'Leg Bye', penalty: 'Penalty',
    };
    parts.push(names[extras]);
  }
  if (runs === 0 && extras === 'normal') return 'Dot ball';
  if (runs > 0) parts.push(`${runs} run${runs > 1 ? 's' : ''}`);
  return parts.join(' + ') || 'Delivery recorded';
}

export function computeRunRate(totalRuns: number, oversStr: string) {
  const oversNum = parseFloat(String(oversStr));
  const completedOvers = Math.floor(oversNum);
  const partialBalls = Math.round((oversNum - completedOvers) * 10);
  const totalBalls = completedOvers * 6 + partialBalls;
  if (totalBalls === 0) return '0.00';
  return ((totalRuns / totalBalls) * 6).toFixed(2);
}
