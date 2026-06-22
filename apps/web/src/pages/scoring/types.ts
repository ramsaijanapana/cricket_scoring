export type ExtrasMode = 'normal' | 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty';

export const DISMISSAL_TYPES = [
  'bowled', 'caught', 'lbw', 'run_out',
  'stumped', 'hit_wicket', 'caught_and_bowled', 'obstructing',
  'timed_out', 'handled_ball', 'retired_hurt',
] as const;

export const EXTRAS_CONFIG: { mode: ExtrasMode; label: string; activeClass: string }[] = [
  { mode: 'wide', label: 'Wide', activeClass: 'bg-cricket-gold/20 text-cricket-gold border-cricket-gold/40' },
  { mode: 'noball', label: 'No Ball', activeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  { mode: 'bye', label: 'Bye', activeClass: 'bg-cricket-blue/20 text-cricket-blue border-cricket-blue/40' },
  { mode: 'legbye', label: 'Leg Bye', activeClass: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
];

export interface CompletionInfo {
  teamName: string;
  score: number;
  wickets: number;
  overs: string;
  resultSummary?: string;
}
