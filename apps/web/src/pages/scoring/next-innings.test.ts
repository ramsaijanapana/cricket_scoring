import { describe, it, expect } from 'vitest';
import { buildNextInningsBody } from './next-innings';

const innings = [{
  status: 'completed',
  inningsNumber: 1,
  battingTeamId: 'team-a',
  bowlingTeamId: 'team-b',
}];

describe('buildNextInningsBody', () => {
  it('sends the side that just bowled in to bat, in playing order', () => {
    const built = buildNextInningsBody({
      innings,
      teams: [
        { teamId: 'team-a', playingXi: ['a1', 'a2'] },
        { teamId: 'team-b', playingXi: ['b1', null, 'b2', 'b3'] },
      ],
    });

    expect(built).toEqual({
      ok: true,
      body: {
        battingTeamId: 'team-b',
        bowlingTeamId: 'team-a',
        battingOrder: ['b1', 'b2', 'b3'],
      },
    });
  });

  it('refuses to start a chase with fewer than two listed batsmen', () => {
    const built = buildNextInningsBody({
      innings,
      teams: [{ teamId: 'team-b', playingXi: ['b1'] }],
    });

    expect(built.ok).toBe(false);
  });

  it('follows the latest completed innings when more than one is stored', () => {
    const built = buildNextInningsBody({
      innings: [
        ...innings,
        { status: 'completed', inningsNumber: 2, battingTeamId: 'team-b', bowlingTeamId: 'team-a' },
      ],
      teams: [{ teamId: 'team-a', playingXi: ['a1', 'a2'] }],
    });

    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.body.battingTeamId).toBe('team-a');
      expect(built.body.bowlingTeamId).toBe('team-b');
    }
  });
});
