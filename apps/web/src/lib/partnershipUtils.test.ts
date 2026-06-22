import { describe, it, expect } from 'vitest';
import { buildPlayerNameMap, mapPartnershipsForChart } from './partnershipUtils';

describe('partnershipUtils', () => {
  it('builds a player name lookup from scorecard rows', () => {
    const map = buildPlayerNameMap([
      {
        batting: [{ playerId: 'p1', playerName: 'Alice' }],
        bowling: [{ playerId: 'p2', playerName: 'Bob' }],
      },
    ]);

    expect(map.get('p1')).toBe('Alice');
    expect(map.get('p2')).toBe('Bob');
  });

  it('filters partnerships by innings and enriches chart rows', () => {
    const rows = mapPartnershipsForChart(
      [
        {
          inningsId: 'inn-1',
          batsman1Id: 'p1',
          batsman2Id: 'p2',
          runs: 54,
          balls: 38,
          isUnbroken: true,
        },
        {
          inningsId: 'inn-2',
          batsman1Id: 'p3',
          batsman2Id: 'p4',
          runs: 12,
          balls: 10,
        },
      ],
      'inn-1',
      new Map([
        ['p1', 'Alice'],
        ['p2', 'Bob'],
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      batsman1Name: 'Alice',
      batsman2Name: 'Bob',
      runs: 54,
      isUnbroken: true,
    });
  });
});
