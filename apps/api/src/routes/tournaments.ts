import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { tournament, match, matchTeam, innings, team } from '../db/schema/index';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { parsePagination, paginatedResponse } from '../middleware/pagination';
import { z } from 'zod';

// ─── Validation schemas ─────────────────────────────────────────────────────

const createTournamentSchema = z.object({
  name: z.string().min(1).max(300),
  shortName: z.string().max(30).optional(),
  season: z.string().max(20).optional(),
  format: z.enum(['t20', 'odi', 'test', 'the_hundred', 't10', 'custom']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  organizer: z.string().max(200).optional(),
  groupStageConfig: z.object({
    groups: z.number().int().min(1).max(8).optional(),
    teamsPerGroup: z.number().int().min(2).max(20).optional(),
    pointsForWin: z.number().int().default(2),
    pointsForTie: z.number().int().default(1),
    pointsForNR: z.number().int().default(1),
  }).optional(),
  teamIds: z.array(z.string().uuid()).optional(),
});

const addFixtureSchema = z.object({
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
  formatConfigId: z.string().min(1),
  matchNumber: z.number().int().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  scheduledStart: z.string().optional(),
  stage: z.enum(['group', 'quarter_final', 'semi_final', 'final', 'eliminator', 'qualifier']).optional(),
});

// ─── NRR Calculator ─────────────────────────────────────────────────────────

interface TeamMatchStats {
  runsScored: number;
  oversFaced: number;  // decimal overs e.g. 19.3
  runsConceded: number;
  oversBowled: number;
}

function oversToDecimal(overs: string | number): number {
  const str = String(overs);
  const parts = str.split('.');
  const wholeOvers = parseInt(parts[0], 10) || 0;
  const balls = parseInt(parts[1] || '0', 10);
  return wholeOvers + balls / 6;
}

function computeNRR(stats: TeamMatchStats): number {
  if (stats.oversFaced === 0 || stats.oversBowled === 0) return 0;
  return (stats.runsScored / stats.oversFaced) - (stats.runsConceded / stats.oversBowled);
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export const tournamentRoutes: FastifyPluginAsync = async (app) => {
  // List all tournaments
  app.get('/', async (req) => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const query = req.query as Record<string, string>;
    const statusFilter = query.status; // 'upcoming' | 'live' | 'completed'

    const tournaments = await db.query.tournament.findMany({
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
      offset,
    });

    const now = new Date();
    const enriched = tournaments.map((t) => {
      let status: 'upcoming' | 'live' | 'completed' = 'upcoming';
      if (t.startDate && t.endDate) {
        const start = new Date(t.startDate);
        const end = new Date(t.endDate);
        if (now > end) status = 'completed';
        else if (now >= start) status = 'live';
      } else if (t.startDate) {
        const start = new Date(t.startDate);
        if (now >= start) status = 'live';
      }
      return { ...t, status };
    });

    const filtered = statusFilter
      ? enriched.filter((t) => t.status === statusFilter)
      : enriched;

    return paginatedResponse(filtered, page, limit);
  });

  // Create tournament
  app.post('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = createTournamentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { groupStageConfig, teamIds, ...tournamentData } = parsed.data;

    const [created] = await db.insert(tournament).values(tournamentData).returning();

    return reply.status(201).send({
      ...created,
      groupStageConfig: groupStageConfig || null,
      teamIds: teamIds || [],
    });
  });

  // Get tournament detail with matches
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const t = await db.query.tournament.findFirst({
      where: eq(tournament.id, req.params.id),
    });
    if (!t) return reply.status(404).send({ error: 'Tournament not found' });

    // Get all matches in this tournament
    const matches = await db.query.match.findMany({
      where: and(eq(match.tournamentId, req.params.id), eq(match.isDeleted, false)),
      orderBy: (m, { asc }) => [asc(m.matchNumber), asc(m.scheduledStart)],
    });

    // Enrich matches with teams
    const matchIds = matches.map((m) => m.id);
    const allMatchTeams = matchIds.length > 0
      ? await db.query.matchTeam.findMany({ where: inArray(matchTeam.matchId, matchIds) })
      : [];
    const teamIds = [...new Set(allMatchTeams.map((mt) => mt.teamId))];
    const allTeams = teamIds.length > 0
      ? await db.query.team.findMany({ where: inArray(team.id, teamIds) })
      : [];
    const teamMap = Object.fromEntries(allTeams.map((t) => [t.id, t]));

    const matchTeamsByMatch = new Map<string, typeof allMatchTeams>();
    for (const mt of allMatchTeams) {
      const arr = matchTeamsByMatch.get(mt.matchId) || [];
      arr.push(mt);
      matchTeamsByMatch.set(mt.matchId, arr);
    }

    // Get all innings for NRR computation
    const allInnings = matchIds.length > 0
      ? await db.query.innings.findMany({ where: inArray(innings.matchId, matchIds) })
      : [];
    const inningsByMatch = new Map<string, typeof allInnings>();
    for (const inn of allInnings) {
      const arr = inningsByMatch.get(inn.matchId) || [];
      arr.push(inn);
      inningsByMatch.set(inn.matchId, arr);
    }

    const fixtures = matches.map((m) => {
      const teams = matchTeamsByMatch.get(m.id) || [];
      const homeTeam = teams.find((t) => t.designation === 'home');
      const awayTeam = teams.find((t) => t.designation === 'away');
      const matchInnings = inningsByMatch.get(m.id) || [];
      const latestInnings = matchInnings.sort((a, b) => b.inningsNumber - a.inningsNumber)[0];

      return {
        ...m,
        homeTeamId: homeTeam?.teamId || null,
        awayTeamId: awayTeam?.teamId || null,
        homeTeamName: homeTeam ? teamMap[homeTeam.teamId]?.name || 'Unknown' : 'TBD',
        awayTeamName: awayTeam ? teamMap[awayTeam.teamId]?.name || 'Unknown' : 'TBD',
        currentScore: latestInnings ? `${latestInnings.totalRuns}/${latestInnings.totalWickets}` : null,
        currentOvers: latestInnings?.totalOvers || null,
      };
    });

    // Compute status
    const now = new Date();
    let status: 'upcoming' | 'live' | 'completed' = 'upcoming';
    if (t.startDate && t.endDate) {
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      if (now > end) status = 'completed';
      else if (now >= start) status = 'live';
    }

    return {
      ...t,
      status,
      fixtures,
      teams: allTeams,
    };
  });

  // Add fixture to tournament
  app.post<{ Params: { id: string } }>('/:id/fixtures', { preHandler: [requireAuth] }, async (req, reply) => {
    const t = await db.query.tournament.findFirst({
      where: eq(tournament.id, req.params.id),
    });
    if (!t) return reply.status(404).send({ error: 'Tournament not found' });

    const parsed = addFixtureSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { homeTeamId, awayTeamId, formatConfigId, matchNumber, venue, city, scheduledStart } = parsed.data;

    // Create the match linked to tournament
    const [newMatch] = await db.insert(match).values({
      tournamentId: req.params.id,
      formatConfigId,
      matchNumber,
      venue,
      city,
      scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
      status: 'scheduled',
    }).returning();

    // Create match teams
    await db.insert(matchTeam).values([
      { matchId: newMatch.id, teamId: homeTeamId, designation: 'home' },
      { matchId: newMatch.id, teamId: awayTeamId, designation: 'away' },
    ]);

    return reply.status(201).send(newMatch);
  });

  // Computed points table with NRR
  app.get<{ Params: { id: string } }>('/:id/points-table', async (req, reply) => {
    const t = await db.query.tournament.findFirst({
      where: eq(tournament.id, req.params.id),
    });
    if (!t) return reply.status(404).send({ error: 'Tournament not found' });

    // Get all completed matches
    const completedMatches = await db.query.match.findMany({
      where: and(
        eq(match.tournamentId, req.params.id),
        eq(match.isDeleted, false),
      ),
    });

    const matchIds = completedMatches.map((m) => m.id);
    if (matchIds.length === 0) return { pointsTable: [] };

    const allMatchTeams = await db.query.matchTeam.findMany({
      where: inArray(matchTeam.matchId, matchIds),
    });

    const allInnings = await db.query.innings.findMany({
      where: inArray(innings.matchId, matchIds),
    });

    // Collect all unique teams in tournament
    const teamIds = [...new Set(allMatchTeams.map((mt) => mt.teamId))];
    const allTeams = teamIds.length > 0
      ? await db.query.team.findMany({ where: inArray(team.id, teamIds) })
      : [];
    const teamMap = Object.fromEntries(allTeams.map((t) => [t.id, t]));

    // Build points table
    interface PointsEntry {
      teamId: string;
      teamName: string;
      played: number;
      won: number;
      lost: number;
      drawn: number;
      noResult: number;
      points: number;
      nrrStats: TeamMatchStats;
      nrr: number;
    }

    const table = new Map<string, PointsEntry>();
    for (const tid of teamIds) {
      table.set(tid, {
        teamId: tid,
        teamName: teamMap[tid]?.name || 'Unknown',
        played: 0,
        won: 0,
        lost: 0,
        drawn: 0,
        noResult: 0,
        points: 0,
        nrrStats: { runsScored: 0, oversFaced: 0, runsConceded: 0, oversBowled: 0 },
        nrr: 0,
      });
    }

    // Process each match
    for (const m of completedMatches) {
      const teams = allMatchTeams.filter((mt) => mt.matchId === m.id);
      const matchInns = allInnings.filter((i) => i.matchId === m.id);

      for (const mt of teams) {
        const entry = table.get(mt.teamId);
        if (!entry) continue;

        const isCompleted = m.status === 'completed';

        if (isCompleted) {
          entry.played++;

          if (m.winnerTeamId === mt.teamId) {
            entry.won++;
            entry.points += 2;
          } else if (m.winnerTeamId) {
            entry.lost++;
          } else if (m.resultSummary?.toLowerCase().includes('draw')) {
            entry.drawn++;
            entry.points += 1;
          } else {
            // No result or tie
            entry.noResult++;
            entry.points += 1;
          }

          // NRR calculation — accumulate runs/overs
          const battingInnings = matchInns.filter((i) => i.battingTeamId === mt.teamId);
          const bowlingInnings = matchInns.filter((i) => i.bowlingTeamId === mt.teamId);

          for (const bi of battingInnings) {
            entry.nrrStats.runsScored += bi.totalRuns;
            entry.nrrStats.oversFaced += oversToDecimal(bi.totalOvers);
          }
          for (const bi of bowlingInnings) {
            entry.nrrStats.runsConceded += bi.totalRuns;
            entry.nrrStats.oversBowled += oversToDecimal(bi.totalOvers);
          }
        }
      }
    }

    // Compute final NRR and sort
    const pointsTable = Array.from(table.values())
      .map((entry) => {
        entry.nrr = computeNRR(entry.nrrStats);
        const { nrrStats, ...rest } = entry;
        return { ...rest, nrr: parseFloat(entry.nrr.toFixed(3)) };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.nrr - a.nrr;
      });

    return { pointsTable };
  });

};
