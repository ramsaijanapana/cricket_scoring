import type { Page } from '@playwright/test';

export const MOCK_MATCH_ID = 'a11y-match-1';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'];

export const mockInProgressMatch = {
  id: MOCK_MATCH_ID,
  status: 'live',
  format: 't20',
  teams: [
    {
      teamId: TEAM_A,
      teamName: 'Team Alpha',
      designation: 'home',
      playingXi: PLAYER_IDS.slice(0, 11),
      playerNames: Object.fromEntries(
        PLAYER_IDS.slice(0, 11).map((id, i) => [id, `Alpha Player ${i + 1}`]),
      ),
    },
    {
      teamId: TEAM_B,
      teamName: 'Team Beta',
      designation: 'away',
      playingXi: PLAYER_IDS.map((id) => `b-${id}`),
      playerNames: Object.fromEntries(
        PLAYER_IDS.map((id, i) => [`b-${id}`, `Beta Player ${i + 1}`]),
      ),
    },
  ],
  innings: [
    {
      id: 'innings-1',
      matchId: MOCK_MATCH_ID,
      inningsNumber: 1,
      battingTeamId: TEAM_A,
      bowlingTeamId: TEAM_B,
      status: 'in_progress',
      totalRuns: 42,
      totalWickets: 1,
      totalOvers: '5.2',
      targetScore: null,
      battingScorecard: [
        {
          playerId: 'p1',
          playerName: 'Alpha Player 1',
          runsScored: 24,
          ballsFaced: 18,
          fours: 2,
          sixes: 1,
          isOut: false,
          didNotBat: false,
        },
        {
          playerId: 'p2',
          playerName: 'Alpha Player 2',
          runsScored: 10,
          ballsFaced: 14,
          fours: 0,
          sixes: 0,
          isOut: false,
          didNotBat: false,
        },
        {
          playerId: 'p3',
          playerName: 'Alpha Player 3',
          runsScored: 0,
          ballsFaced: 0,
          fours: 0,
          sixes: 0,
          isOut: true,
          didNotBat: false,
        },
        ...PLAYER_IDS.slice(3, 11).map((id, i) => ({
          playerId: id,
          playerName: `Alpha Player ${i + 4}`,
          runsScored: 0,
          ballsFaced: 0,
          fours: 0,
          sixes: 0,
          isOut: false,
          didNotBat: true,
        })),
      ],
      bowlingScorecard: [
        {
          playerId: 'b-p1',
          playerName: 'Beta Player 1',
          oversBowled: '5.2',
          maidens: 0,
          runsConceded: 42,
          wickets: 1,
        },
      ],
    },
  ],
};

/** Stub API responses so e2e tests run without a live backend. */
export async function mockPublicApi(page: Page) {
  await page.route('**/api/v1/matches**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET' && url.includes(`/matches/${MOCK_MATCH_ID}`) && !url.includes('/deliveries') && !url.includes('/scorecard')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockInProgressMatch),
      });
      return;
    }

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockInProgressMatch]),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/v1/users/feed**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], page: 1, limit: 20 }),
    });
  });

  await page.route('**/api/v1/notifications**', async (route) => {
    const url = route.request().url();
    if (url.includes('/unread-count')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0 }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], page: 1, limit: 20 }),
    });
  });

  await page.route('**/api/v1/matches/*/deliveries**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          newStrikerId: 'p1',
          newNonStrikerId: 'p2',
          overCompleted: false,
          delivery: { runsBatsman: 1 },
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/matches/*/presence**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0 }),
    });
  });
}
