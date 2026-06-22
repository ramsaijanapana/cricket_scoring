import type { Commentary } from '@cricket/shared';

export type KeyMomentCategory = 'milestone' | 'wicket' | 'audit' | 'partnership';

export interface KeyMoment {
  id: string;
  category: KeyMomentCategory;
  label: string;
  detail?: string;
  inningsNum?: number;
  timestamp?: string;
  sortKey: number;
}

interface AuditEntry {
  id: string;
  action: string;
  createdAt: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface ScorecardInnings {
  innings?: { id?: string; inningsNumber?: number };
  batting?: Array<{
    playerId?: string;
    playerName?: string;
    runsScored?: number;
    isOut?: boolean;
    didNotBat?: boolean;
  }>;
  bowling?: Array<{
    playerId?: string;
    playerName?: string;
    wicketsTaken?: number;
  }>;
  fallOfWickets?: Array<{
    wicketNumber?: number;
    inningsScore?: number;
    playerName?: string;
    overNumber?: string | number;
  }>;
}

const MILESTONE_LABELS: Record<string, string> = {
  fifty: 'Fifty',
  hundred: 'Century',
  five_wickets: 'Five-wicket haul',
  hat_trick: 'Hat-trick',
  team_50: 'Team 50',
  team_100: 'Team 100',
  team_150: 'Team 150',
  team_200: 'Team 200',
};

const AUDIT_LABELS: Record<string, string> = {
  delivery_undone: 'Ball undone',
  delivery_corrected: 'Ball corrected',
};

function milestoneLabel(type: string): string {
  return MILESTONE_LABELS[type] ?? type.replace(/_/g, ' ');
}

function parseOverBallSortKey(overBall?: string): number {
  if (!overBall) return 0;
  const [over, ball] = overBall.split('.').map(Number);
  if (Number.isNaN(over) || Number.isNaN(ball)) return 0;
  return over * 6 + ball;
}

export function buildKeyMomentsFromScorecard(scorecard: ScorecardInnings[]): KeyMoment[] {
  const moments: KeyMoment[] = [];

  scorecard.forEach((inn, idx) => {
    const inningsNum = inn.innings?.inningsNumber ?? idx + 1;

    for (const batter of inn.batting ?? []) {
      if (batter.didNotBat) continue;
      const runs = batter.runsScored ?? 0;
      const name = batter.playerName ?? 'Batter';
      if (runs >= 100) {
        moments.push({
          id: `scorecard-century-${batter.playerId ?? name}-${inningsNum}`,
          category: 'milestone',
          label: 'Century',
          detail: `${name} — ${runs}${batter.isOut ? '' : '*'}`,
          inningsNum,
          sortKey: inningsNum * 10_000 + runs,
        });
      } else if (runs >= 50) {
        moments.push({
          id: `scorecard-fifty-${batter.playerId ?? name}-${inningsNum}`,
          category: 'milestone',
          label: 'Fifty',
          detail: `${name} — ${runs}${batter.isOut ? '' : '*'}`,
          inningsNum,
          sortKey: inningsNum * 10_000 + runs,
        });
      }
    }

    for (const bowler of inn.bowling ?? []) {
      const wickets = bowler.wicketsTaken ?? 0;
      if (wickets >= 5) {
        const name = bowler.playerName ?? 'Bowler';
        moments.push({
          id: `scorecard-fivefer-${bowler.playerId ?? name}-${inningsNum}`,
          category: 'milestone',
          label: 'Five-wicket haul',
          detail: `${name} — ${wickets} wickets`,
          inningsNum,
          sortKey: inningsNum * 10_000 + 500 + wickets,
        });
      }
    }

    for (const fow of inn.fallOfWickets ?? []) {
      moments.push({
        id: `fow-${inningsNum}-${fow.wicketNumber ?? 0}-${fow.inningsScore ?? 0}`,
        category: 'wicket',
        label: `Wicket ${fow.wicketNumber ?? '?'}`,
        detail: `${fow.playerName ?? 'Batter'} ${fow.inningsScore ?? 0} (${fow.overNumber ?? '?'} ov)`,
        inningsNum,
        sortKey: inningsNum * 10_000 + parseOverBallSortKey(String(fow.overNumber ?? '0.0')),
      });
    }
  });

  return moments;
}

export function buildKeyMomentsFromCommentary(entries: Commentary[]): KeyMoment[] {
  return entries
    .filter((entry) => entry.milestone)
    .map((entry) => ({
      id: `commentary-${entry.id}`,
      category: 'milestone' as const,
      label: milestoneLabel(entry.milestone!),
      detail: entry.textShort || entry.text,
      inningsNum: entry.inningsNum,
      timestamp: entry.publishedAt,
      sortKey: entry.inningsNum * 10_000 + parseOverBallSortKey(entry.overBall),
    }));
}

export function buildKeyMomentsFromAudit(entries: AuditEntry[]): KeyMoment[] {
  return entries
    .filter((entry) => entry.action in AUDIT_LABELS)
    .map((entry) => ({
      id: `audit-${entry.id}`,
      category: 'audit' as const,
      label: AUDIT_LABELS[entry.action],
      detail:
        entry.action === 'delivery_corrected' && entry.before && entry.after
          ? summarizeAuditChange(entry.before, entry.after)
          : undefined,
      timestamp: entry.createdAt,
      sortKey: new Date(entry.createdAt).getTime(),
    }));
}

function summarizeAuditChange(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const changes: string[] = [];
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changes.push(`${key}: ${String(before[key])} → ${String(after[key])}`);
    }
  }
  return changes.slice(0, 2).join(', ') || 'Scoring correction applied';
}

export function mergeKeyMoments(...groups: KeyMoment[][]): KeyMoment[] {
  const seen = new Set<string>();
  const merged: KeyMoment[] = [];

  for (const group of groups) {
    for (const moment of group) {
      if (seen.has(moment.id)) continue;
      seen.add(moment.id);
      merged.push(moment);
    }
  }

  return merged.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return b.sortKey - a.sortKey;
  });
}
