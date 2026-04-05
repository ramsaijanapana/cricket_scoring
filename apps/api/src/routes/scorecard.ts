import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { innings, matchTeam, delivery } from '../db/schema/index';
import { player } from '../db/schema/player';
import { team } from '../db/schema/team';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';

export const scorecardRoutes: FastifyPluginAsync = async (app) => {
  // Get full scorecard for a match — enriched with player + team names
  app.get<{ Params: { id: string } }>('/:id/scorecard', async (req, reply) => {
    const matchInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc }) => [asc(i.inningsNumber)],
    });

    if (matchInnings.length === 0) return [];

    const inningsIds = matchInnings.map(i => i.id);

    // Batch-fetch teams for this match
    const teams = await db.query.matchTeam.findMany({
      where: eq(matchTeam.matchId, req.params.id),
    });
    const teamIds = [...new Set(teams.map(t => t.teamId))];
    const allTeams = teamIds.length > 0
      ? await db.query.team.findMany({ where: inArray(team.id, teamIds) })
      : [];
    const teamMap = Object.fromEntries(allTeams.map(t => [t.id, t]));

    // Batch-fetch wicket deliveries for FoW (non-overridden, isWicket=true)
    const allWicketDeliveries = await db.query.delivery.findMany({
      where: and(
        inArray(delivery.inningsId, inningsIds),
        eq(delivery.isWicket, true),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [asc(delivery.undoStackPos)],
    });

    // Group wicket deliveries by inningsId
    const wicketsByInnings = new Map<string, typeof allWicketDeliveries>();
    for (const w of allWicketDeliveries) {
      const arr = wicketsByInnings.get(w.inningsId) || [];
      arr.push(w);
      wicketsByInnings.set(w.inningsId, arr);
    }

    // Batch-fetch all scorecard entries across all innings
    const [allBatting, allBowling, allFielding] = await Promise.all([
      db.query.battingScorecard.findMany({
        where: inArray(battingScorecard.inningsId, inningsIds),
        orderBy: (bs, { asc }) => [asc(bs.battingPosition)],
      }),
      db.query.bowlingScorecard.findMany({
        where: inArray(bowlingScorecard.inningsId, inningsIds),
        orderBy: (bs, { asc }) => [asc(bs.bowlingPosition)],
      }),
      db.query.fieldingScorecard.findMany({
        where: inArray(fieldingScorecard.inningsId, inningsIds),
      }),
    ]);

    // Batch-fetch all players referenced in scorecards + wicket deliveries (one query)
    const dismissedPlayerIds = allWicketDeliveries
      .map(w => w.dismissedId)
      .filter((id): id is string => id !== null);
    const allPlayerIds = [...new Set([
      ...allBatting.map(b => b.playerId),
      ...allBowling.map(b => b.playerId),
      ...dismissedPlayerIds,
    ])];
    const allPlayers = allPlayerIds.length > 0
      ? await db.query.player.findMany({ where: inArray(player.id, allPlayerIds) })
      : [];
    const playerMap = Object.fromEntries(
      allPlayers.map(p => [p.id, { firstName: p.firstName, lastName: p.lastName }])
    );

    function getPlayerName(playerId: string) {
      return playerMap[playerId] || { firstName: 'Unknown', lastName: '' };
    }

    // Group scorecards by inningsId
    const battingByInnings = new Map<string, typeof allBatting>();
    for (const b of allBatting) {
      const arr = battingByInnings.get(b.inningsId) || [];
      arr.push(b);
      battingByInnings.set(b.inningsId, arr);
    }
    const bowlingByInnings = new Map<string, typeof allBowling>();
    for (const b of allBowling) {
      const arr = bowlingByInnings.get(b.inningsId) || [];
      arr.push(b);
      bowlingByInnings.set(b.inningsId, arr);
    }
    const fieldingByInnings = new Map<string, typeof allFielding>();
    for (const f of allFielding) {
      const arr = fieldingByInnings.get(f.inningsId) || [];
      arr.push(f);
      fieldingByInnings.set(f.inningsId, arr);
    }

    // Batch-fetch extras breakdown: aggregate runsExtras by extraType per innings
    const extrasRows = await db
      .select({
        inningsId: delivery.inningsId,
        extraType: delivery.extraType,
        total: sql<number>`coalesce(sum(${delivery.runsExtras}), 0)`.as('total'),
      })
      .from(delivery)
      .where(
        and(
          inArray(delivery.inningsId, inningsIds),
          eq(delivery.isOverridden, false),
          sql`${delivery.extraType} is not null`,
        ),
      )
      .groupBy(delivery.inningsId, delivery.extraType);

    // Build extras map: inningsId -> { total, wides, noBalls, byes, legByes, penalties }
    const extrasMap = new Map<string, { total: number; wides: number; noBalls: number; byes: number; legByes: number; penalties: number }>();
    for (const row of extrasRows) {
      if (!extrasMap.has(row.inningsId)) {
        extrasMap.set(row.inningsId, { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 });
      }
      const entry = extrasMap.get(row.inningsId)!;
      const runs = Number(row.total);
      entry.total += runs;
      if (row.extraType === 'wide') entry.wides += runs;
      else if (row.extraType === 'noball') entry.noBalls += runs;
      else if (row.extraType === 'bye') entry.byes += runs;
      else if (row.extraType === 'legbye') entry.legByes += runs;
      else if (row.extraType === 'penalty') entry.penalties += runs;
    }

    const scorecard = matchInnings.map((inn) => {
      const batting = battingByInnings.get(inn.id) || [];
      const bowling = bowlingByInnings.get(inn.id) || [];
      const fielding = fieldingByInnings.get(inn.id) || [];

      const enrichedBatting = batting.map(b => {
        const p = getPlayerName(b.playerId);
        return { ...b, playerName: `${p.firstName} ${p.lastName}`.trim() };
      });

      const enrichedBowling = bowling.map(b => {
        const p = getPlayerName(b.playerId);
        return { ...b, playerName: `${p.firstName} ${p.lastName}`.trim() };
      });

      const battingTeam = teamMap[inn.battingTeamId];
      const bowlingTeam = teamMap[inn.bowlingTeamId];

      const extrasBreakdown = extrasMap.get(inn.id);
      const extras = extrasBreakdown
        ? { total: extrasBreakdown.total, wides: extrasBreakdown.wides, noBalls: extrasBreakdown.noBalls, byes: extrasBreakdown.byes, legByes: extrasBreakdown.legByes, penalties: extrasBreakdown.penalties }
        : { total: inn.totalExtras, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 };

      // Fall of wickets derived from delivery data (ordered by undoStackPos)
      const wicketDeliveries = wicketsByInnings.get(inn.id) || [];
      const fallOfWickets = wicketDeliveries.map((w, idx) => {
        const dismissed = w.dismissedId ? getPlayerName(w.dismissedId) : { firstName: 'Unknown', lastName: '' };
        const dismissedName = `${dismissed.firstName} ${dismissed.lastName}`.trim();
        return {
          wicketNumber: idx + 1,
          inningsScore: w.inningsScore,
          playerName: dismissedName,
          overNumber: w.inningsOvers,
        };
      });

      return {
        innings: inn,
        battingTeamName: battingTeam?.name || 'Unknown',
        bowlingTeamName: bowlingTeam?.name || 'Unknown',
        batting: enrichedBatting,
        bowling: enrichedBowling,
        fielding,
        extras,
        fallOfWickets,
      };
    });

    return scorecard;
  });

  // Get scorecard for a specific innings
  app.get<{ Params: { id: string; inningsId: string } }>(
    '/:id/innings/:inningsId/scorecard',
    async (req, reply) => {
      const inn = await db.query.innings.findFirst({
        where: eq(innings.id, req.params.inningsId),
      });
      if (!inn) return reply.status(404).send({ error: 'Innings not found' });

      const batting = await db.query.battingScorecard.findMany({
        where: eq(battingScorecard.inningsId, req.params.inningsId),
        orderBy: (bs, { asc }) => [asc(bs.battingPosition)],
      });

      const bowling = await db.query.bowlingScorecard.findMany({
        where: eq(bowlingScorecard.inningsId, req.params.inningsId),
        orderBy: (bs, { asc }) => [asc(bs.bowlingPosition)],
      });

      // Batch-fetch all referenced players in one query
      const playerIds = [...new Set([
        ...batting.map(b => b.playerId),
        ...bowling.map(b => b.playerId),
      ])];
      const players = playerIds.length > 0
        ? await db.query.player.findMany({ where: inArray(player.id, playerIds) })
        : [];
      const playerLookup = Object.fromEntries(players.map(p => [p.id, p]));

      const enrichedBatting = batting.map(b => {
        const p = playerLookup[b.playerId];
        return { ...b, playerName: p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown' };
      });

      const enrichedBowling = bowling.map(b => {
        const p = playerLookup[b.playerId];
        return { ...b, playerName: p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown' };
      });

      return { innings: inn, batting: enrichedBatting, bowling: enrichedBowling };
    },
  );
};
