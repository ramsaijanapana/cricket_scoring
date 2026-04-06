import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index';
import { innings, matchTeam, delivery, match } from '../db/schema/index';
import { player } from '../db/schema/player';
import { team } from '../db/schema/team';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { cacheGet, cacheSet } from '../services/cache';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const scorecardRoutes: FastifyPluginAsync = async (app) => {
  // Get full scorecard for a match — enriched with player + team names
  app.get<{ Params: { id: string } }>('/:id/scorecard', async (req, reply) => {
    // Check Redis cache first
    const cacheKey = `match:${req.params.id}:scorecard`;
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) return cached;

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

    // Cache the scorecard (no TTL — invalidated on each delivery)
    cacheSet(cacheKey, scorecard);

    return scorecard;
  });

  // Generate PDF scorecard for a match
  app.get<{ Params: { id: string } }>('/:id/scorecard/pdf', async (req, reply) => {
    // Fetch match details
    const matchRow = await db.query.match.findFirst({
      where: eq(match.id, req.params.id),
    });
    if (!matchRow) return reply.status(404).send({ error: 'Match not found' });

    // Fetch teams for the match
    const teams = await db.query.matchTeam.findMany({
      where: eq(matchTeam.matchId, req.params.id),
    });
    const teamIds = [...new Set(teams.map(t => t.teamId))];
    const allTeams = teamIds.length > 0
      ? await db.query.team.findMany({ where: inArray(team.id, teamIds) })
      : [];
    const teamMap = Object.fromEntries(allTeams.map(t => [t.id, t]));

    // Team names for the header
    const teamNames = teams.map(t => teamMap[t.teamId]?.name || 'Unknown');
    const matchTitle = teamNames.length >= 2
      ? `${teamNames[0]} vs ${teamNames[1]}`
      : 'Cricket Match';

    // Reuse the scorecard data by calling the same logic
    const matchInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, req.params.id),
      orderBy: (i, { asc: a }) => [a(i.inningsNumber)],
    });

    if (matchInnings.length === 0) {
      return reply.status(404).send({ error: 'No innings data available' });
    }

    const inningsIds = matchInnings.map(i => i.id);

    // Batch-fetch wicket deliveries for FoW
    const allWicketDeliveries = await db.query.delivery.findMany({
      where: and(
        inArray(delivery.inningsId, inningsIds),
        eq(delivery.isWicket, true),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [asc(delivery.undoStackPos)],
    });

    const wicketsByInnings = new Map<string, typeof allWicketDeliveries>();
    for (const w of allWicketDeliveries) {
      const arr = wicketsByInnings.get(w.inningsId) || [];
      arr.push(w);
      wicketsByInnings.set(w.inningsId, arr);
    }

    // Batch-fetch scorecard entries
    const [allBatting, allBowling] = await Promise.all([
      db.query.battingScorecard.findMany({
        where: inArray(battingScorecard.inningsId, inningsIds),
        orderBy: (bs, { asc: a }) => [a(bs.battingPosition)],
      }),
      db.query.bowlingScorecard.findMany({
        where: inArray(bowlingScorecard.inningsId, inningsIds),
        orderBy: (bs, { asc: a }) => [a(bs.bowlingPosition)],
      }),
    ]);

    // Batch-fetch all players
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
      const p = playerMap[playerId];
      return p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown';
    }

    // Group by innings
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

    // Extras breakdown
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

    // ─── Generate PDF ───────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    // Colors
    const greenPrimary: [number, number, number] = [22, 163, 74];
    const darkText: [number, number, number] = [30, 30, 30];
    const mutedText: [number, number, number] = [120, 120, 120];

    // ── Header ──
    doc.setFillColor(...greenPrimary);
    doc.rect(0, 0, pageWidth, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(matchTitle, pageWidth / 2, y, { align: 'center' });
    y += 7;

    const metaParts: string[] = [];
    if (matchRow.cricketType) metaParts.push(matchRow.cricketType.toUpperCase());
    if (matchRow.venue) metaParts.push(matchRow.venue);
    if (matchRow.city) metaParts.push(matchRow.city);
    if (matchRow.scheduledStart) {
      metaParts.push(new Date(matchRow.scheduledStart).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      }));
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(metaParts.join('  |  '), pageWidth / 2, y, { align: 'center' });
    y += 4;

    if (matchRow.resultSummary) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(matchRow.resultSummary, pageWidth / 2, y + 3, { align: 'center' });
      y += 6;
    }

    y = 38;

    // ── Per-innings sections ──
    for (let idx = 0; idx < matchInnings.length; idx++) {
      const inn = matchInnings[idx];
      const batting = battingByInnings.get(inn.id) || [];
      const bowling = bowlingByInnings.get(inn.id) || [];
      const extras = extrasMap.get(inn.id) || { total: inn.totalExtras, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 };
      const wicketDeliveries = wicketsByInnings.get(inn.id) || [];
      const battingTeamName = teamMap[inn.battingTeamId]?.name || 'Batting';
      const bowlingTeamName = teamMap[inn.bowlingTeamId]?.name || 'Bowling';
      const ordinal = ['', '1st', '2nd', '3rd', '4th'][idx + 1] || `${idx + 1}th`;

      // Check if we need a new page (enough space for header + a few rows)
      if (y > 230) {
        doc.addPage();
        y = 14;
      }

      // Innings header bar
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
      doc.setTextColor(...darkText);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${ordinal} Innings — ${battingTeamName}`, margin + 3, y + 7);
      const totalStr = `${inn.totalRuns}/${inn.totalWickets} (${inn.totalOvers} ov)`;
      doc.text(totalStr, pageWidth - margin - 3, y + 7, { align: 'right' });
      y += 14;

      // Batting table
      const activeBatters = batting.filter(b => !b.didNotBat);
      const battingBody = activeBatters.map((b, pos) => {
        const name = getPlayerName(b.playerId);
        const dismissal = b.isOut
          ? (b.dismissalText || b.dismissalType?.replace(/_/g, ' ') || 'out')
          : 'not out';
        const sr = b.strikeRate ? Number(b.strikeRate).toFixed(1) : '-';
        return [
          String(pos + 1),
          name,
          dismissal,
          `${b.runsScored}${!b.isOut ? '*' : ''}`,
          String(b.ballsFaced),
          String(b.fours),
          String(b.sixes),
          sr,
        ];
      });

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Batsman', 'Dismissal', 'R', 'B', '4s', '6s', 'SR']],
        body: battingBody,
        theme: 'striped',
        headStyles: {
          fillColor: greenPrimary,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'left', cellWidth: 38 },
          2: { halign: 'left', cellWidth: 52 },
          3: { halign: 'center', cellWidth: 12, fontStyle: 'bold' },
          4: { halign: 'center', cellWidth: 12 },
          5: { halign: 'center', cellWidth: 12 },
          6: { halign: 'center', cellWidth: 12 },
          7: { halign: 'center', cellWidth: 16 },
        },
        styles: { fontSize: 8, cellPadding: 2, textColor: darkText },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });

      y = (doc as any).lastAutoTable.finalY + 2;

      // Did not bat
      const dnb = batting.filter(b => b.didNotBat);
      if (dnb.length > 0) {
        doc.setFontSize(7.5);
        doc.setTextColor(...mutedText);
        doc.setFont('helvetica', 'italic');
        const dnbNames = dnb.map(b => getPlayerName(b.playerId)).join(', ');
        doc.text(`Did not bat: ${dnbNames}`, margin + 1, y + 3);
        y += 5;
      }

      // Extras
      doc.setFontSize(8);
      doc.setTextColor(...darkText);
      doc.setFont('helvetica', 'normal');
      const extrasParts: string[] = [];
      if (extras.wides) extrasParts.push(`W ${extras.wides}`);
      if (extras.noBalls) extrasParts.push(`NB ${extras.noBalls}`);
      if (extras.byes) extrasParts.push(`B ${extras.byes}`);
      if (extras.legByes) extrasParts.push(`LB ${extras.legByes}`);
      if (extras.penalties) extrasParts.push(`P ${extras.penalties}`);
      const extrasLine = `Extras: ${extras.total} (${extrasParts.join(', ')})`;
      doc.text(extrasLine, margin + 1, y + 3);
      y += 6;

      // Fall of wickets
      if (wicketDeliveries.length > 0) {
        const fowParts = wicketDeliveries.map((w, i) => {
          const dismissed = w.dismissedId ? getPlayerName(w.dismissedId) : 'Unknown';
          return `${i + 1}/${w.inningsScore} (${dismissed}, ${w.inningsOvers} ov)`;
        });

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...mutedText);
        doc.text('Fall of Wickets:', margin + 1, y + 3);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        // Wrap long FoW text
        const fowText = fowParts.join('   ');
        const fowLines = doc.splitTextToSize(fowText, pageWidth - 2 * margin - 2);
        doc.text(fowLines, margin + 1, y + 2);
        y += fowLines.length * 3.5 + 2;
      }

      y += 2;

      // Check page break before bowling
      if (y > 240) {
        doc.addPage();
        y = 14;
      }

      // Bowling table
      const activeBowlers = bowling.filter(b =>
        parseFloat(String(b.oversBowled)) > 0 || b.runsConceded > 0 || b.wicketsTaken > 0
      );

      if (activeBowlers.length > 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkText);
        doc.text(`Bowling — ${bowlingTeamName}`, margin + 1, y + 3);
        y += 6;

        const bowlingBody = activeBowlers.map(b => [
          getPlayerName(b.playerId),
          String(b.oversBowled),
          String(b.maidens),
          String(b.runsConceded),
          String(b.wicketsTaken),
          b.economyRate ? Number(b.economyRate).toFixed(1) : '-',
        ]);

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Bowler', 'O', 'M', 'R', 'W', 'Econ']],
          body: bowlingBody,
          theme: 'striped',
          headStyles: {
            fillColor: [220, 38, 38],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'center',
          },
          columnStyles: {
            0: { halign: 'left', cellWidth: 50 },
            1: { halign: 'center', cellWidth: 18 },
            2: { halign: 'center', cellWidth: 18 },
            3: { halign: 'center', cellWidth: 18 },
            4: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
            5: { halign: 'center', cellWidth: 22 },
          },
          styles: { fontSize: 8, cellPadding: 2, textColor: darkText },
          alternateRowStyles: { fillColor: [255, 248, 248] },
        });

        y = (doc as any).lastAutoTable.finalY + 8;
      }
    }

    // ── Footer ──
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(...mutedText);
      doc.setFont('helvetica', 'italic');
      doc.text(
        'Generated by CricScore',
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );
    }

    // ── Send PDF ──
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const safeTitle = matchTitle.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${safeTitle}_scorecard.pdf"`)
      .send(pdfBuffer);
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
