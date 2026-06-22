import { colors } from '../tokens/colors';
import { withAlpha } from '../lib/color-utils';

export type MatchStatusValue =
  | 'scheduled' | 'live' | 'innings_break' | 'rain_delay' | 'completed' | 'abandoned' | 'toss';

export interface MatchStatusConfig {
  label: string;
  color: string;
  bgColor: string;
  pulse?: boolean;
}

const green = colors.cricket.green;
const blue = colors.cricket.blue;
const gold = colors.cricket.gold;
const red = colors.cricket.red;
const purple = colors.cricket.purple;
const muted = colors.surface[400];

export const matchStatusConfig: Record<string, MatchStatusConfig> = {
  live: { label: 'LIVE', color: green, bgColor: withAlpha(green, 0.15), pulse: true },
  scheduled: { label: 'SCHEDULED', color: blue, bgColor: withAlpha(blue, 0.15) },
  completed: { label: 'COMPLETED', color: muted, bgColor: withAlpha(muted, 0.15) },
  rain_delay: { label: 'RAIN DELAY', color: purple, bgColor: withAlpha(purple, 0.15) },
  innings_break: { label: 'INNINGS BREAK', color: gold, bgColor: withAlpha(gold, 0.15) },
  abandoned: { label: 'ABANDONED', color: red, bgColor: withAlpha(red, 0.15) },
  toss: { label: 'TOSS', color: blue, bgColor: withAlpha(blue, 0.15) },
};

export function getMatchStatusConfig(status: string): MatchStatusConfig {
  return matchStatusConfig[status] ?? matchStatusConfig.scheduled;
}

export function getMatchAccentColor(status: string): string {
  return getMatchStatusConfig(status).color;
}
