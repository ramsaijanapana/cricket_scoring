export interface ApiPartnership {
  inningsId?: string;
  batsman1Id: string;
  batsman2Id: string;
  runs: number;
  balls: number;
  isUnbroken?: boolean;
}

export interface PartnershipChartRow {
  batsman1Id: string;
  batsman1Name?: string;
  batsman2Id: string;
  batsman2Name?: string;
  runs: number;
  balls: number;
  isUnbroken?: boolean;
}

interface ScorecardPlayerRow {
  playerId?: string;
  playerName?: string;
}

interface ScorecardInnings {
  innings?: { id?: string };
  batting?: ScorecardPlayerRow[];
  bowling?: ScorecardPlayerRow[];
}

export function buildPlayerNameMap(scorecard: ScorecardInnings[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const inn of scorecard) {
    for (const row of [...(inn.batting ?? []), ...(inn.bowling ?? [])]) {
      if (row.playerId && row.playerName) {
        map.set(row.playerId, row.playerName);
      }
    }
  }
  return map;
}

export function mapPartnershipsForChart(
  partnerships: ApiPartnership[],
  inningsId: string | undefined,
  nameById: Map<string, string>,
): PartnershipChartRow[] {
  return partnerships
    .filter((p) => !inningsId || p.inningsId === inningsId)
    .map((p) => ({
      batsman1Id: p.batsman1Id,
      batsman2Id: p.batsman2Id,
      batsman1Name: nameById.get(p.batsman1Id),
      batsman2Name: nameById.get(p.batsman2Id),
      runs: p.runs,
      balls: p.balls,
      isUnbroken: p.isUnbroken,
    }));
}
