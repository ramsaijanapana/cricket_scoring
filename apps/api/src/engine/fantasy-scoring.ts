import { db } from '../db/index';
import { fantasyContest, fantasyTeam, fantasyPointsLog } from '../db/schema/fantasy';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { innings } from '../db/schema/innings';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Fantasy Cricket Scoring Engine
 *
 * Default scoring rules:
 *   runs       = 1pt per run
 *   fours      = 1pt bonus per four
 *   sixes      = 2pt bonus per six
 *   wickets    = 25pt per wicket
 *   catches    = 8pt per catch
 *   maidens    = 12pt per maiden
 *   economy bonus/penalty (T20):
 *     < 6.0 economy  = +6pt
 *     6.0-7.0        = +4pt
 *     7.0-8.0        = +2pt
 *     10.0-11.0      = -2pt
 *     11.0-12.0      = -4pt
 *     > 12.0         = -6pt
 *   strike rate bonus/penalty (min 10 balls):
 *     SR > 170       = +6pt
 *     SR 150-170     = +4pt
 *     SR 130-150     = +2pt
 *     SR 60-70       = -2pt
 *     SR 50-60       = -4pt
 *     SR < 50        = -6pt
 */

interface FantasyScoringRules {
  runPoints?: number;
  fourBonus?: number;
  sixBonus?: number;
  wicketPoints?: number;
  catchPoints?: number;
  maidenPoints?: number;
  economyBonusThresholds?: { max: number; points: number }[];
  economyPenaltyThresholds?: { min: number; points: number }[];
  srBonusThresholds?: { min: number; points: number }[];
  srPenaltyThresholds?: { max: number; points: number }[];
  minBallsForSR?: number;
  minOversForEcon?: number;
}

const DEFAULT_RULES: FantasyScoringRules = {
  runPoints: 1,
  fourBonus: 1,
  sixBonus: 2,
  wicketPoints: 25,
  catchPoints: 8,
  maidenPoints: 12,
  economyBonusThresholds: [
    { max: 6.0, points: 6 },
    { max: 7.0, points: 4 },
    { max: 8.0, points: 2 },
  ],
  economyPenaltyThresholds: [
    { min: 12.0, points: -6 },
    { min: 11.0, points: -4 },
    { min: 10.0, points: -2 },
  ],
  srBonusThresholds: [
    { min: 170, points: 6 },
    { min: 150, points: 4 },
    { min: 130, points: 2 },
  ],
  srPenaltyThresholds: [
    { max: 50, points: -6 },
    { max: 60, points: -4 },
    { max: 70, points: -2 },
  ],
  minBallsForSR: 10,
  minOversForEcon: 2,
};

function mergeRules(custom: any): FantasyScoringRules {
  return { ...DEFAULT_RULES, ...(custom || {}) };
}

/**
 * Calculate fantasy points for a single player in a contest's match.
 */
export function calculatePlayerPoints(
  batting: { runsScored: number; fours: number; sixes: number; ballsFaced: number; strikeRate: string | null } | null,
  bowling: { wicketsTaken: number; maidens: number; oversBowled: string; economyRate: string | null } | null,
  fielding: { catches: number } | null,
  rules: FantasyScoringRules,
): { total: number; breakdown: { reason: string; points: number }[] } {
  const breakdown: { reason: string; points: number }[] = [];
  let total = 0;

  // Batting points
  if (batting) {
    const runPts = batting.runsScored * (rules.runPoints ?? 1);
    if (runPts > 0) breakdown.push({ reason: 'runs', points: runPts });
    total += runPts;

    const fourPts = batting.fours * (rules.fourBonus ?? 1);
    if (fourPts > 0) breakdown.push({ reason: 'fours_bonus', points: fourPts });
    total += fourPts;

    const sixPts = batting.sixes * (rules.sixBonus ?? 2);
    if (sixPts > 0) breakdown.push({ reason: 'sixes_bonus', points: sixPts });
    total += sixPts;

    // Strike rate bonus/penalty
    const sr = batting.strikeRate ? parseFloat(batting.strikeRate) : (batting.ballsFaced > 0 ? (batting.runsScored / batting.ballsFaced) * 100 : 0);
    if (batting.ballsFaced >= (rules.minBallsForSR ?? 10)) {
      let srPts = 0;
      for (const t of rules.srBonusThresholds ?? []) {
        if (sr >= t.min) { srPts = t.points; break; }
      }
      if (srPts === 0) {
        for (const t of rules.srPenaltyThresholds ?? []) {
          if (sr <= t.max) { srPts = t.points; break; }
        }
      }
      if (srPts !== 0) {
        breakdown.push({ reason: srPts > 0 ? 'sr_bonus' : 'sr_penalty', points: srPts });
        total += srPts;
      }
    }
  }

  // Bowling points
  if (bowling) {
    const wktPts = bowling.wicketsTaken * (rules.wicketPoints ?? 25);
    if (wktPts > 0) breakdown.push({ reason: 'wickets', points: wktPts });
    total += wktPts;

    const maidenPts = bowling.maidens * (rules.maidenPoints ?? 12);
    if (maidenPts > 0) breakdown.push({ reason: 'maidens', points: maidenPts });
    total += maidenPts;

    // Economy bonus/penalty
    const overs = parseFloat(bowling.oversBowled || '0');
    if (overs >= (rules.minOversForEcon ?? 2)) {
      const econ = bowling.economyRate ? parseFloat(bowling.economyRate) : (overs > 0 ? 0 : 0);
      if (econ > 0) {
        let econPts = 0;
        for (const t of rules.economyBonusThresholds ?? []) {
          if (econ <= t.max) { econPts = t.points; break; }
        }
        if (econPts === 0) {
          for (const t of rules.economyPenaltyThresholds ?? []) {
            if (econ >= t.min) { econPts = t.points; break; }
          }
        }
        if (econPts !== 0) {
          breakdown.push({ reason: econPts > 0 ? 'economy_bonus' : 'economy_penalty', points: econPts });
          total += econPts;
        }
      }
    }
  }

  // Fielding points
  if (fielding) {
    const catchPts = fielding.catches * (rules.catchPoints ?? 8);
    if (catchPts > 0) breakdown.push({ reason: 'catches', points: catchPts });
    total += catchPts;
  }

  return { total, breakdown };
}

/**
 * Score all teams in a contest by computing points for each player in each team.
 * Updates fantasyTeam.totalPoints and fantasyTeam.rank.
 */
export async function scoreContest(contestId: string): Promise<void> {
  const contest = await db.query.fantasyContest.findFirst({
    where: eq(fantasyContest.id, contestId),
  });
  if (!contest) return;

  const rules = mergeRules(contest.scoringRules);

  // Get match innings
  const matchInnings = contest.matchId
    ? await db.query.innings.findMany({ where: eq(innings.matchId, contest.matchId) })
    : [];
  const inningsIds = matchInnings.map(i => i.id);

  // Get all teams in this contest
  const teams = await db
    .select()
    .from(fantasyTeam)
    .where(eq(fantasyTeam.contestId, contestId));

  for (const team of teams) {
    const playerIds: string[] = Array.isArray(team.players)
      ? (team.players as any[]).map((p: any) => typeof p === 'string' ? p : p.id).filter(Boolean)
      : [];

    let teamTotal = 0;

    for (const playerId of playerIds) {
      let playerBatting: any = null;
      let playerBowling: any = null;
      let playerFielding: any = null;

      // Aggregate across all innings
      for (const iId of inningsIds) {
        const bat = await db.query.battingScorecard.findFirst({
          where: and(eq(battingScorecard.inningsId, iId), eq(battingScorecard.playerId, playerId)),
        });
        if (bat) {
          if (!playerBatting) {
            playerBatting = { runsScored: 0, fours: 0, sixes: 0, ballsFaced: 0, strikeRate: null };
          }
          playerBatting.runsScored += bat.runsScored;
          playerBatting.fours += bat.fours;
          playerBatting.sixes += bat.sixes;
          playerBatting.ballsFaced += bat.ballsFaced;
        }

        const bowl = await db.query.bowlingScorecard.findFirst({
          where: and(eq(bowlingScorecard.inningsId, iId), eq(bowlingScorecard.playerId, playerId)),
        });
        if (bowl) {
          if (!playerBowling) {
            playerBowling = { wicketsTaken: 0, maidens: 0, oversBowled: '0', economyRate: null };
          }
          playerBowling.wicketsTaken += bowl.wicketsTaken;
          playerBowling.maidens += bowl.maidens;
          const prevOvers = parseFloat(playerBowling.oversBowled);
          const addOvers = parseFloat(bowl.oversBowled);
          playerBowling.oversBowled = String(prevOvers + addOvers);
          playerBowling.economyRate = bowl.economyRate;
        }

        const field = await db.query.fieldingScorecard.findFirst({
          where: and(eq(fieldingScorecard.inningsId, iId), eq(fieldingScorecard.playerId, playerId)),
        });
        if (field) {
          if (!playerFielding) playerFielding = { catches: 0 };
          playerFielding.catches += field.catches;
        }
      }

      // Compute SR after aggregation
      if (playerBatting && playerBatting.ballsFaced > 0) {
        playerBatting.strikeRate = String((playerBatting.runsScored / playerBatting.ballsFaced) * 100);
      }

      const { total, breakdown } = calculatePlayerPoints(playerBatting, playerBowling, playerFielding, rules);
      teamTotal += total;

      // Log points for each player
      if (total !== 0) {
        await db.insert(fantasyPointsLog).values({
          contestId,
          playerId,
          points: total,
          reason: breakdown.map(b => `${b.reason}:${b.points}`).join(','),
        });
      }
    }

    await db.update(fantasyTeam).set({ totalPoints: teamTotal }).where(eq(fantasyTeam.id, team.id));
  }

  // Compute ranks
  const rankedTeams = await db
    .select()
    .from(fantasyTeam)
    .where(eq(fantasyTeam.contestId, contestId))
    .orderBy(desc(fantasyTeam.totalPoints));

  for (let i = 0; i < rankedTeams.length; i++) {
    await db.update(fantasyTeam).set({ rank: i + 1 }).where(eq(fantasyTeam.id, rankedTeams[i].id));
  }
}
