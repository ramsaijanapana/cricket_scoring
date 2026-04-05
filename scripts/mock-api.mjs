/**
 * Lightweight mock API server for local frontend testing.
 * No Docker/PostgreSQL/Redis required — all data is in-memory.
 * Run: node scripts/mock-api.mjs
 * Serves on http://localhost:3001
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = 3001;

// In-memory store
const db = {
  users: [],
  refreshTokens: new Map(),
  teams: [
    { id: 't1', name: 'Mumbai Indians', teamType: 'franchise', createdAt: new Date().toISOString() },
    { id: 't2', name: 'Chennai Super Kings', teamType: 'franchise', createdAt: new Date().toISOString() },
    { id: 't3', name: 'Royal Challengers', teamType: 'franchise', createdAt: new Date().toISOString() },
    { id: 't4', name: 'Kolkata Knight Riders', teamType: 'franchise', createdAt: new Date().toISOString() },
  ],
  players: [
    { id: 'p1', firstName: 'Rohit', lastName: 'Sharma', battingStyle: 'right_hand', bowlingStyle: 'right_arm_medium' },
    { id: 'p2', firstName: 'Virat', lastName: 'Kohli', battingStyle: 'right_hand', bowlingStyle: 'right_arm_medium' },
    { id: 'p3', firstName: 'Jasprit', lastName: 'Bumrah', battingStyle: 'right_hand', bowlingStyle: 'right_arm_fast' },
    { id: 'p4', firstName: 'MS', lastName: 'Dhoni', battingStyle: 'right_hand', bowlingStyle: 'right_arm_medium' },
  ],
  formatConfigs: [
    { id: 'fc-t20', name: 'T20 International', base_format: 't20', max_overs: 20, innings_count: 2, powerplay_windows: [{ pp_num: 1, start_over: 1, end_over: 6, type: 'mandatory' }], free_hit_on_noball: true, super_over_enabled: true, follow_on_threshold: null, dls_applicable: true, max_overs_per_bowler: 4, declaration_allowed: false },
    { id: 'fc-odi', name: 'ODI', base_format: 'odi', max_overs: 50, innings_count: 2, powerplay_windows: [{ pp_num: 1, start_over: 1, end_over: 10, type: 'mandatory' }, { pp_num: 2, start_over: 11, end_over: 40, type: 'fielding_choice' }, { pp_num: 3, start_over: 41, end_over: 50, type: 'mandatory' }], free_hit_on_noball: true, super_over_enabled: true, follow_on_threshold: null, dls_applicable: true, max_overs_per_bowler: 10, declaration_allowed: false },
    { id: 'fc-test', name: 'Test Match', base_format: 'test', max_overs: null, innings_count: 4, powerplay_windows: [], free_hit_on_noball: false, super_over_enabled: false, follow_on_threshold: 200, dls_applicable: false, max_overs_per_bowler: null, declaration_allowed: true },
  ],
  matches: [
    {
      id: 'm1',
      format: 't20',
      formatConfigId: 'fc-t20',
      venue: 'Wankhede Stadium',
      city: 'Mumbai',
      status: 'live',
      homeTeamId: 't1',
      awayTeamId: 't2',
      result_summary: null,
      tossWinnerId: 't1',
      tossDecision: 'bat',
      createdAt: new Date().toISOString(),
      teams: [
        { id: 'mt1', matchId: 'm1', teamId: 't1', designation: 'home', playingXi: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'] },
        { id: 'mt2', matchId: 'm1', teamId: 't2', designation: 'away', playingXi: ['p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18', 'p19', 'p20', 'p21', 'p22'] },
      ],
      innings: [
        {
          id: 'i1',
          matchId: 'm1',
          inningsNumber: 1,
          battingTeamId: 't1',
          bowlingTeamId: 't2',
          status: 'in_progress',
          totalRuns: 142,
          totalWickets: 3,
          totalOvers: '15.4',
          totalBalls: 94,
          extras: { wides: 5, noBalls: 2, byes: 1, legByes: 3, penalties: 0, total: 11 },
          targetScore: null,
          isSuperOver: false,
        },
      ],
    },
    {
      id: 'm2',
      format: 't20',
      formatConfigId: 'fc-t20',
      venue: 'M. Chinnaswamy Stadium',
      city: 'Bengaluru',
      status: 'completed',
      homeTeamId: 't3',
      awayTeamId: 't4',
      result_summary: 'Royal Challengers won by 6 wickets',
      tossWinnerId: 't4',
      tossDecision: 'bat',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      teams: [],
      innings: [],
    },
    {
      id: 'm3',
      format: 't20',
      formatConfigId: 'fc-t20',
      venue: 'Eden Gardens',
      city: 'Kolkata',
      status: 'scheduled',
      homeTeamId: 't4',
      awayTeamId: 't1',
      result_summary: null,
      tossWinnerId: null,
      tossDecision: null,
      createdAt: new Date(Date.now() + 86400000).toISOString(),
      teams: [],
      innings: [],
    },
  ],
  deliveries: [],
  reviews: [],
};

// Mock scorecard data
function mockScorecard(matchId) {
  const match = db.matches.find(m => m.id === matchId);
  if (!match?.innings?.length) return [];

  const battingTeam = db.teams.find(t => t.id === match.innings[0]?.battingTeamId) || db.teams.find(t => t.id === match.homeTeamId);
  const bowlingTeam = db.teams.find(t => t.id === match.innings[0]?.bowlingTeamId) || db.teams.find(t => t.id === match.awayTeamId);

  return match.innings.map(inn => ({
    innings: inn,
    battingTeamName: battingTeam?.name || 'Team A',
    bowlingTeamName: bowlingTeam?.name || 'Team B',
    batting: [
      { id: 'bs1', playerName: 'Rohit Sharma', battingPosition: 1, runsScored: 45, ballsFaced: 32, fours: 5, sixes: 2, strikeRate: 140.6, isOut: true, dismissalType: 'caught', dismissalText: 'c Dhoni b Bumrah', didNotBat: false },
      { id: 'bs2', playerName: 'Virat Kohli', battingPosition: 2, runsScored: 62, ballsFaced: 41, fours: 7, sixes: 3, strikeRate: 151.2, isOut: false, dismissalType: null, dismissalText: null, didNotBat: false },
      { id: 'bs3', playerName: 'Suryakumar Yadav', battingPosition: 3, runsScored: 8, ballsFaced: 12, fours: 1, sixes: 0, strikeRate: 66.7, isOut: true, dismissalType: 'bowled', dismissalText: 'b Chahar', didNotBat: false },
      { id: 'bs4', playerName: 'Hardik Pandya', battingPosition: 4, runsScored: 18, ballsFaced: 9, fours: 2, sixes: 1, strikeRate: 200.0, isOut: true, dismissalType: 'lbw', dismissalText: 'lbw b Jadeja', didNotBat: false },
    ],
    bowling: [
      { id: 'bw1', playerName: 'Jasprit Bumrah', bowlingPosition: 1, oversBowled: '4.0', maidens: 1, runsConceded: 28, wicketsTaken: 1, economyRate: 7.0 },
      { id: 'bw2', playerName: 'Deepak Chahar', bowlingPosition: 2, oversBowled: '3.4', maidens: 0, runsConceded: 35, wicketsTaken: 2, economyRate: 9.5 },
      { id: 'bw3', playerName: 'Ravindra Jadeja', bowlingPosition: 3, oversBowled: '4.0', maidens: 0, runsConceded: 42, wicketsTaken: 0, economyRate: 10.5 },
      { id: 'bw4', playerName: 'Shardul Thakur', bowlingPosition: 4, oversBowled: '4.0', maidens: 0, runsConceded: 31, wicketsTaken: 0, economyRate: 7.75 },
    ],
    extras: inn.extras || { wides: 5, noBalls: 2, byes: 1, legByes: 3, penalties: 0, total: 11 },
  }));
}

// Parse JSON body
function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

// Route matching
function matchRoute(method, url, pattern) {
  if (req_method !== method) return null;
  const patternParts = pattern.split('/');
  const urlParts = url.split('?')[0].split('/');
  if (patternParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = urlParts[i];
    } else if (patternParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

let req_method = '';

const server = http.createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;
  req_method = method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const path = url.split('?')[0];
  const segments = path.split('/').filter(Boolean); // ['api','v1','matches',...]

  try {
    // GET /health
    if (method === 'GET' && (path === '/health' || path === '/api/v1/health')) {
      return json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // --- AUTH ROUTES ---
    // POST /api/v1/auth/register
    if (method === 'POST' && path === '/api/v1/auth/register') {
      const body = await parseBody(req);
      const existing = db.users.find(u => u.email === body.email);
      if (existing) return json({ error: { code: 'DUPLICATE_EMAIL', message: 'Email already registered' } }, 409);
      const user = {
        id: 'u' + crypto.randomUUID().slice(0, 8),
        email: body.email,
        displayName: body.displayName || body.name || 'User',
        role: 'scorer',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      return json(user, 201);
    }

    // POST /api/v1/auth/login
    if (method === 'POST' && path === '/api/v1/auth/login') {
      const body = await parseBody(req);
      const user = db.users.find(u => u.email === body.email);
      if (!user) return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
      const accessToken = 'at_' + crypto.randomUUID();
      const refreshToken = 'rt_' + crypto.randomUUID();
      db.refreshTokens.set(refreshToken, user.id);
      return json({ access_token: accessToken, refresh_token: refreshToken, expires_in: 3600, user });
    }

    // POST /api/v1/auth/refresh
    if (method === 'POST' && path === '/api/v1/auth/refresh') {
      const body = await parseBody(req);
      const userId = db.refreshTokens.get(body.refresh_token);
      if (!userId) return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }, 401);
      db.refreshTokens.delete(body.refresh_token);
      const newAccess = 'at_' + crypto.randomUUID();
      const newRefresh = 'rt_' + crypto.randomUUID();
      db.refreshTokens.set(newRefresh, userId);
      return json({ access_token: newAccess, refresh_token: newRefresh, expires_in: 3600 });
    }

    // POST /api/v1/auth/logout
    if (method === 'POST' && path === '/api/v1/auth/logout') {
      const body = await parseBody(req);
      db.refreshTokens.delete(body.refresh_token);
      res.writeHead(204);
      return res.end();
    }

    // --- FORMAT CONFIG ROUTES ---
    // GET /api/v1/format-configs
    if (method === 'GET' && path === '/api/v1/format-configs') {
      return json(db.formatConfigs);
    }

    // POST /api/v1/format-configs
    if (method === 'POST' && path === '/api/v1/format-configs') {
      const body = await parseBody(req);
      const fc = {
        id: 'fc-' + crypto.randomUUID().slice(0, 8),
        name: body.name || 'Custom Format',
        base_format: body.base_format || 'custom',
        max_overs: body.max_overs || null,
        innings_count: body.innings_count || 2,
        powerplay_windows: body.powerplay_windows || [],
        free_hit_on_noball: body.free_hit_on_noball ?? true,
        super_over_enabled: body.super_over_enabled ?? false,
        follow_on_threshold: body.follow_on_threshold || null,
        dls_applicable: body.dls_applicable ?? false,
        max_overs_per_bowler: body.max_overs_per_bowler || null,
        declaration_allowed: body.declaration_allowed ?? false,
      };
      db.formatConfigs.push(fc);
      return json(fc, 201);
    }

    // GET /api/v1/format-configs/:id
    if (method === 'GET' && segments.length === 4 && segments[0] === 'api' && segments[1] === 'v1' && segments[2] === 'format-configs') {
      const fc = db.formatConfigs.find(f => f.id === segments[3]);
      return fc ? json(fc) : json({ error: 'Format config not found' }, 404);
    }

    // --- GDPR ROUTES ---
    // GET /api/v1/users/me/export
    if (method === 'GET' && path === '/api/v1/users/me/export') {
      const userId = req.headers['x-user-id'];
      const user = db.users.find(u => u.id === userId);
      if (!user) return json({ error: 'User not found' }, 404);
      return json({ user, matches: [], deliveries: [], exportedAt: new Date().toISOString() });
    }

    // DELETE /api/v1/users/me
    if (method === 'DELETE' && path === '/api/v1/users/me') {
      const userId = req.headers['x-user-id'];
      const idx = db.users.findIndex(u => u.id === userId);
      if (idx === -1) return json({ error: 'User not found' }, 404);
      db.users.splice(idx, 1);
      res.writeHead(204);
      return res.end();
    }

    // GET /api/v1/matches
    if (method === 'GET' && path === '/api/v1/matches') {
      return json(db.matches);
    }

    // GET /api/v1/matches/:id
    if (method === 'GET' && segments.length === 4 && segments[0] === 'api' && segments[1] === 'v1' && segments[2] === 'matches') {
      const match = db.matches.find(m => m.id === segments[3]);
      return match ? json(match) : json({ error: 'Match not found' }, 404);
    }

    // POST /api/v1/matches
    if (method === 'POST' && path === '/api/v1/matches') {
      const body = await parseBody(req);
      const match = {
        id: 'm' + crypto.randomUUID().slice(0, 8),
        venue: body.venue || 'Unknown Venue',
        city: body.city || '',
        status: 'scheduled',
        homeTeamId: body.homeTeamId,
        awayTeamId: body.awayTeamId,
        result_summary: null,
        tossWinnerId: null,
        tossDecision: null,
        createdAt: new Date().toISOString(),
        innings: [],
      };
      db.matches.push(match);
      return json(match, 201);
    }

    // POST /api/v1/matches/:id/toss
    if (method === 'POST' && segments.length === 5 && segments[4] === 'toss') {
      const match = db.matches.find(m => m.id === segments[3]);
      if (!match) return json({ error: 'Match not found' }, 404);
      const body = await parseBody(req);
      match.tossWinnerId = body.winner_id;
      match.tossDecision = body.decision;
      return json(match);
    }

    // POST /api/v1/matches/:id/start
    if (method === 'POST' && segments.length === 5 && segments[4] === 'start') {
      const match = db.matches.find(m => m.id === segments[3]);
      if (!match) return json({ error: 'Match not found' }, 404);
      const body = await parseBody(req);
      match.status = 'live';
      const battingTeamId = body.batting_team_id || match.homeTeamId;
      const bowlingTeamId = battingTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

      // Auto-generate playing XI player IDs if teams not yet set
      if (!match.teams || match.teams.length === 0) {
        const homeXi = Array.from({ length: 11 }, (_, i) => 'ph' + crypto.randomUUID().slice(0, 6) + i);
        const awayXi = Array.from({ length: 11 }, (_, i) => 'pa' + crypto.randomUUID().slice(0, 6) + i);
        match.teams = [
          { id: 'mt' + crypto.randomUUID().slice(0, 6), matchId: match.id, teamId: match.homeTeamId, designation: 'home', playingXi: homeXi },
          { id: 'mt' + crypto.randomUUID().slice(0, 6), matchId: match.id, teamId: match.awayTeamId, designation: 'away', playingXi: awayXi },
        ];
      }

      match.innings = [{
        id: 'i' + crypto.randomUUID().slice(0, 8),
        matchId: match.id,
        inningsNumber: 1,
        battingTeamId,
        bowlingTeamId,
        status: 'in_progress',
        totalRuns: 0,
        totalWickets: 0,
        totalOvers: '0.0',
        totalBalls: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0, total: 0 },
        targetScore: null,
        isSuperOver: false,
      }];
      return json(match, 201);
    }

    // POST /api/v1/matches/:id/interruption
    if (method === 'POST' && segments.length === 5 && segments[4] === 'interruption') {
      const match = db.matches.find(m => m.id === segments[3]);
      if (!match) return json({ error: 'Match not found' }, 404);
      const body = await parseBody(req);
      match.status = 'rain_delay';
      return json({ match, interruption: { reason: body.reason || 'rain', timestamp: new Date().toISOString() } });
    }

    // POST /api/v1/matches/:id/resume
    if (method === 'POST' && segments.length === 5 && segments[4] === 'resume') {
      const match = db.matches.find(m => m.id === segments[3]);
      if (!match) return json({ error: 'Match not found' }, 404);
      match.status = 'live';
      return json({ match, resumed_at: new Date().toISOString() });
    }

    // POST /api/v1/matches/:id/reviews
    if (method === 'POST' && segments.length === 5 && segments[4] === 'reviews') {
      const match = db.matches.find(m => m.id === segments[3]);
      if (!match) return json({ error: 'Match not found' }, 404);
      const body = await parseBody(req);
      const review = {
        id: 'rv' + crypto.randomUUID().slice(0, 8),
        match_id: match.id,
        delivery_id: body.delivery_id,
        innings_num: body.innings_num || 1,
        reviewing_team_id: body.reviewing_team_id,
        review_number: 1,
        status: 'pending',
        original_decision: body.original_decision || { is_wicket: true, wicket_type: 'lbw', runs_awarded: 0 },
        revised_decision: null,
        wicket_reversed: false,
        runs_changed: false,
        unsuccessful: false,
        requested_at: new Date().toISOString(),
        resolved_at: null,
      };
      db.reviews.push(review);
      return json(review, 201);
    }

    // PATCH /api/v1/matches/:id/reviews/:reviewId
    if (method === 'PATCH' && segments.length === 6 && segments[4] === 'reviews') {
      const review = db.reviews.find(r => r.id === segments[5]);
      if (!review) return json({ error: 'Review not found' }, 404);
      const body = await parseBody(req);
      review.status = body.decision || 'upheld';
      review.revised_decision = body.revised_decision || { is_wicket: body.decision === 'upheld', wicket_type: body.decision === 'upheld' ? 'lbw' : null, runs_awarded: 0 };
      review.wicket_reversed = body.decision === 'overturned';
      review.unsuccessful = body.decision !== 'overturned' && body.decision !== 'umpires_call';
      review.resolved_at = new Date().toISOString();
      return json(review);
    }

    // POST /api/v1/matches/:id/deliveries
    if (method === 'POST' && segments.length === 5 && segments[4] === 'deliveries') {
      const match = db.matches.find(m => m.id === segments[3]);
      if (!match) return json({ error: 'Match not found' }, 404);
      const body = await parseBody(req);
      const innings = match.innings?.find(i => i.status === 'in_progress');
      if (!innings) return json({ error: 'No active innings' }, 400);

      const totalRuns = (body.runs_batsman || 0) + (body.runs_extras || 0);
      innings.totalRuns += totalRuns;
      if (body.is_wicket) innings.totalWickets += 1;

      // Advance ball count (wides and no-balls don't count as legal deliveries)
      const isLegal = !body.extra_type || (body.extra_type !== 'wide' && body.extra_type !== 'noball');
      if (isLegal) {
        innings.totalBalls += 1;
        const overs = Math.floor(innings.totalBalls / 6);
        const balls = innings.totalBalls % 6;
        innings.totalOvers = `${overs}.${balls}`;
      }

      // Check if previous delivery was a no-ball (free hit logic)
      const matchDeliveries = db.deliveries.filter(d => d.matchId === match.id && d.inningsId === innings.id && !d.isOverridden);
      const lastDelivery = matchDeliveries[matchDeliveries.length - 1];
      const isFreeHit = lastDelivery?.extraType === 'noball';

      const delivery = {
        id: 'd' + crypto.randomUUID().slice(0, 8),
        matchId: match.id,
        inningsId: innings.id,
        overNumber: Math.floor((innings.totalBalls - 1) / 6) + 1,
        ballNumber: ((innings.totalBalls - 1) % 6) + 1,
        bowlerId: body.bowler_id || null,
        strikerId: body.striker_id || null,
        nonStrikerId: body.non_striker_id || null,
        runsBatsman: body.runs_batsman || 0,
        runsExtras: body.runs_extras || 0,
        totalRuns,
        extraType: body.extra_type || null,
        isWicket: body.is_wicket || false,
        wicketType: body.wicket_type || null,
        isFreeHit,
        isOverridden: false,
        timestamp: new Date().toISOString(),
        inningsScore: innings.totalRuns,
        inningsWickets: innings.totalWickets,
        inningsOvers: innings.totalOvers,
      };

      // Update extras breakdown
      if (body.extra_type === 'wide') innings.extras.wides += (body.runs_extras || 1);
      if (body.extra_type === 'noball') innings.extras.noBalls += 1;
      if (body.extra_type === 'bye') innings.extras.byes += (body.runs_extras || 0);
      if (body.extra_type === 'legbye') innings.extras.legByes += (body.runs_extras || 0);
      innings.extras.total = innings.extras.wides + innings.extras.noBalls + innings.extras.byes + innings.extras.legByes + innings.extras.penalties;

      db.deliveries.push(delivery);

      const scorecardSnapshot = {
        totalRuns: innings.totalRuns,
        totalWickets: innings.totalWickets,
        totalOvers: innings.totalOvers,
        extras: innings.extras,
      };

      return json({ delivery, innings, commentary: `${totalRuns} run(s) scored`, scorecardSnapshot });
    }

    // DELETE /api/v1/matches/:id/deliveries/last (undo)
    if (method === 'DELETE' && segments.length === 6 && segments[4] === 'deliveries' && segments[5] === 'last') {
      const matchId = segments[3];
      const matchDeliveries = db.deliveries.filter(d => d.matchId === matchId && !d.isOverridden);
      if (matchDeliveries.length > 0) {
        const lastDel = matchDeliveries[matchDeliveries.length - 1];
        lastDel.isOverridden = true;
        return json({ undone: true, delivery: lastDel });
      }
      return json({ undone: true, delivery: null });
    }

    // GET /api/v1/matches/:id/scorecard
    if (method === 'GET' && segments.length === 5 && segments[4] === 'scorecard') {
      return json(mockScorecard(segments[3]));
    }

    // GET /api/v1/matches/:id/commentary
    if (method === 'GET' && segments.length === 5 && segments[4] === 'commentary') {
      return json({ items: [], total: 0, page: 1 });
    }

    // GET /api/v1/teams
    if (method === 'GET' && path === '/api/v1/teams') {
      return json(db.teams);
    }

    // POST /api/v1/teams
    if (method === 'POST' && path === '/api/v1/teams') {
      const body = await parseBody(req);
      const team = {
        id: 't' + crypto.randomUUID().slice(0, 8),
        name: body.name || 'New Team',
        teamType: body.teamType || 'club',
        createdAt: new Date().toISOString(),
      };
      db.teams.push(team);
      return json(team, 201);
    }

    // GET /api/v1/players
    if (method === 'GET' && path === '/api/v1/players') {
      return json(db.players);
    }

    // POST /api/v1/players
    if (method === 'POST' && path === '/api/v1/players') {
      const body = await parseBody(req);
      const player = { id: 'p' + crypto.randomUUID().slice(0, 8), ...body };
      db.players.push(player);
      return json(player, 201);
    }

    // Fallback
    json({ error: 'Not found', path }, 404);
  } catch (err) {
    console.error('Error:', err);
    json({ error: 'Internal server error' }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
  console.log('Endpoints: /api/v1/matches, /api/v1/teams, /api/v1/players');
  console.log('Press Ctrl+C to stop');
});
