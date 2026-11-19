export interface NextInningsSource {
  status: string;
  inningsNumber: number;
  battingTeamId: string;
  bowlingTeamId: string;
}

export interface NextInningsTeam {
  teamId: string;
  playingXi?: (string | null)[] | null;
}

export interface NextInningsBody {
  battingTeamId: string;
  bowlingTeamId: string;
  battingOrder: string[];
}

export type NextInningsBuild =
  | { ok: true; body: NextInningsBody }
  | { ok: false; reason: string };

/**
 * The side that just bowled bats next, in their listed order.
 * The server fills the chase target from the format.
 */
export function buildNextInningsBody(input: {
  innings: NextInningsSource[];
  teams: NextInningsTeam[];
}): NextInningsBuild {
  const completed = input.innings
    .filter((innings) => innings.status === 'completed')
    .sort((a, b) => a.inningsNumber - b.inningsNumber);
  const latest = completed[completed.length - 1];
  if (!latest) {
    return { ok: false, reason: 'No completed innings to follow' };
  }

  const battingOrder = (input.teams.find((team) => team.teamId === latest.bowlingTeamId)?.playingXi ?? [])
    .filter((id): id is string => !!id);
  if (battingOrder.length < 2) {
    return { ok: false, reason: 'The next batting side needs at least two players' };
  }

  return {
    ok: true,
    body: {
      battingTeamId: latest.bowlingTeamId,
      bowlingTeamId: latest.battingTeamId,
      battingOrder,
    },
  };
}
