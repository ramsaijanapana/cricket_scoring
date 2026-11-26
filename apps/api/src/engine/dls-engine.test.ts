import { describe, it, expect } from 'vitest';
import { DLSEngine, subtractCricketOvers } from './dls-engine';

const dls = new DLSEngine();

describe('DLSEngine', () => {
  describe('getResourcePercentage', () => {
    it('returns 100% for 50 overs, 0 wickets', () => {
      expect(dls.getResourcePercentage(50, 0)).toBe(100);
    });

    it('returns 0% for 0 overs remaining', () => {
      expect(dls.getResourcePercentage(0, 0)).toBe(0);
      expect(dls.getResourcePercentage(0, 5)).toBe(0);
    });

    it('returns correct value for 20 overs, 0 wickets (T20 baseline)', () => {
      const r = dls.getResourcePercentage(20, 0);
      expect(r).toBeCloseTo(58.9, 0);
    });

    it('returns lower resources with more wickets lost', () => {
      const r0 = dls.getResourcePercentage(30, 0);
      const r3 = dls.getResourcePercentage(30, 3);
      const r7 = dls.getResourcePercentage(30, 7);
      expect(r3).toBeLessThan(r0);
      expect(r7).toBeLessThan(r3);
    });

    it('returns correct approximate value for 10 overs, 0 wickets', () => {
      const r = dls.getResourcePercentage(10, 0);
      expect(r).toBeCloseTo(36.8, 0);
    });

    it('handles fractional overs (e.g. 10.3)', () => {
      const r10 = dls.getResourcePercentage(10, 0);
      const r15 = dls.getResourcePercentage(15, 0);
      const rFrac = dls.getResourcePercentage(10.3, 0);
      // 10.3 overs = 10 overs + 3 balls = halfway to 11 overs
      expect(rFrac).toBeGreaterThan(r10);
      expect(rFrac).toBeLessThan(r15);
    });

    it('clamps wickets to 0-9 range', () => {
      const r = dls.getResourcePercentage(20, 10);
      // 10 wickets should be treated as 9 (all out is handled separately)
      expect(r).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateParScore', () => {
    it('scales down when team 2 has fewer resources', () => {
      // Team 1 scored 250 with 100% resources, team 2 has 80%
      const par = dls.calculateParScore(250, 100, 80);
      expect(par).toBe(200);
    });

    it('adds runs when team 2 has more resources', () => {
      // Team 1 scored 200 with 80% resources, team 2 has 100%
      const par = dls.calculateParScore(200, 80, 100);
      // par = 200 + 245 * (100 - 80) / 100 = 200 + 49 = 249
      expect(par).toBe(249);
    });

    it('returns 0 when team 1 resources is 0', () => {
      expect(dls.calculateParScore(200, 0, 50)).toBe(0);
    });

    it('handles equal resources', () => {
      const par = dls.calculateParScore(250, 100, 100);
      expect(par).toBe(250);
    });
  });

  describe('calculateRevisedTarget', () => {
    it('calculates revised target for a simple rain interruption', () => {
      // 50-over match. Team 1 scores 250. Rain reduces team 2 to 40 overs.
      const result = dls.calculateRevisedTarget({
        team1Score: 250,
        team1TotalOvers: 50,
        team1WicketsLost: 10,
        team1InningsComplete: true,
        team2TotalOvers: 40,
        interruptions: [{
          oversAtInterruption: 0,
          scoreAtInterruption: 0,
          wicketsLostAtInterruption: 0,
          oversLost: 10,
        }],
      });

      expect(result.revisedTarget).toBeDefined();
      expect(result.revisedTarget!).toBeGreaterThan(0);
      expect(result.revisedTarget!).toBeLessThan(250); // fewer overs = lower target
      expect(result.team1Resources).toBeGreaterThan(result.team2Resources);
      expect(result.parScore).toBe(result.revisedTarget! - 1);
    });

    it('increases target when team 2 gets more resources (e.g. team 1 curtailed)', () => {
      // Team 1 scored 200 in only 40 overs (curtailed). Team 2 gets 50 overs.
      const result = dls.calculateRevisedTarget({
        team1Score: 200,
        team1TotalOvers: 40,
        team1WicketsLost: 4,
        team1InningsComplete: false,
        team2TotalOvers: 50,
        interruptions: [],
      });

      // Team 2 has more resources so target should be higher than 200
      expect(result.revisedTarget!).toBeGreaterThan(200);
    });

    it('handles multiple interruptions', () => {
      const result = dls.calculateRevisedTarget({
        team1Score: 280,
        team1TotalOvers: 50,
        team1WicketsLost: 10,
        team1InningsComplete: true,
        team2TotalOvers: 40,
        interruptions: [
          {
            oversAtInterruption: 0,
            scoreAtInterruption: 0,
            wicketsLostAtInterruption: 0,
            oversLost: 5,
          },
          {
            oversAtInterruption: 20,
            scoreAtInterruption: 100,
            wicketsLostAtInterruption: 3,
            oversLost: 5,
          },
        ],
      });

      expect(result.revisedTarget).toBeDefined();
      expect(result.revisedTarget!).toBeGreaterThan(0);
      expect(result.interruptions).toHaveLength(2);
    });

    it('keeps a full revised allocation when the cut is recorded once', () => {
      // 50-over match, team 1 made 250. Rain before the chase cuts team 2 to 40.
      // Callers pass the original allocation and let oversLost apply the cut once.
      const result = dls.calculateRevisedTarget({
        team1Score: 250,
        team1TotalOvers: 50,
        team1WicketsLost: 10,
        team1InningsComplete: true,
        team2TotalOvers: 50,
        interruptions: [{
          oversAtInterruption: 0,
          scoreAtInterruption: 0,
          wicketsLostAtInterruption: 0,
          oversLost: 10,
        }],
      });

      const team1Resources = dls.getResourcePercentage(50, 0);
      const team2Resources = dls.getResourcePercentage(40, 0);
      const par = dls.calculateParScore(250, team1Resources, team2Resources);
      expect(result.team2Resources).toBeCloseTo(team2Resources, 2);
      expect(result.parScore).toBe(par);
      expect(result.revisedTarget).toBe(par + 1);
      // 40-over resources are 90.3% of a 50-over innings, so the par stays near 226.
      expect(result.revisedTarget).toBe(227);
    });

    it('does not treat 4 balls as a full extra over after a mid-innings stoppage', () => {
      // Stopped at 12.4 (76 balls). A 50-over match cut to 20 leaves 7.2 overs.
      // Base-10 subtraction produces 37.6 and 7.6, which the table reads as 38 and 8.
      const wickets = 2;
      const result = dls.calculateRevisedTarget({
        team1Score: 250,
        team1TotalOvers: 50,
        team1WicketsLost: 10,
        team1InningsComplete: true,
        team2TotalOvers: 50,
        interruptions: [{
          oversAtInterruption: 12.4,
          scoreAtInterruption: 80,
          wicketsLostAtInterruption: wickets,
          oversLost: 30,
        }],
      });

      const before = dls.getResourcePercentage(37.2, wickets);
      const after = dls.getResourcePercentage(7.2, wickets);
      const full = dls.getResourcePercentage(50, 0);
      const expectedResources = full - (before - after);
      expect(result.team2Resources).toBeCloseTo(expectedResources, 2);

      const buggyBefore = dls.getResourcePercentage(38, wickets);
      const buggyAfter = dls.getResourcePercentage(8, wickets);
      const buggyResources = full - (buggyBefore - buggyAfter);
      expect(Math.abs(result.team2Resources - buggyResources)).toBeGreaterThan(0.5);
    });

    it('handles T20 format correctly', () => {
      // T20: Team 1 scores 180. Rain reduces to 15 overs.
      const result = dls.calculateRevisedTarget({
        team1Score: 180,
        team1TotalOvers: 20,
        team1WicketsLost: 10,
        team1InningsComplete: true,
        team2TotalOvers: 15,
        interruptions: [{
          oversAtInterruption: 0,
          scoreAtInterruption: 0,
          wicketsLostAtInterruption: 0,
          oversLost: 5,
        }],
      });

      expect(result.revisedTarget!).toBeLessThan(180);
      expect(result.revisedTarget!).toBeGreaterThan(100);
    });
  });

  describe('subtractCricketOvers', () => {
  it('counts 12.4 as 4 balls, so 50 overs minus 12.4 is 37.2', () => {
    expect(subtractCricketOvers(50, 12.4)).toBeCloseTo(37.2, 5);
  });

  it('subtracts a whole-over cut from a ball remainder without borrowing a ball', () => {
    expect(subtractCricketOvers(37.2, 30)).toBeCloseTo(7.2, 5);
  });

  it('matches decimal subtraction for whole overs', () => {
    expect(subtractCricketOvers(50, 10)).toBe(40);
  });
});

describe('getBaselineScore', () => {
    it('returns 245 for 50-over format', () => {
      expect(dls.getBaselineScore(50)).toBe(245);
    });

    it('returns proportionally lower for T20', () => {
      const g20 = dls.getBaselineScore(20);
      expect(g20).toBeLessThan(245);
      expect(g20).toBeGreaterThan(100);
    });

    it('returns proportionally lower for T10', () => {
      const g10 = dls.getBaselineScore(10);
      const g20 = dls.getBaselineScore(20);
      expect(g10).toBeLessThan(g20);
      expect(g10).toBeGreaterThan(0);
    });
  });

  describe('getCurrentParScore', () => {
    it('returns the par for overs still left in the revised chase', () => {
      // Original 50, cut by 10 before the chase, 20 overs bowled, 2 wickets down.
      const interruptions = [{
        oversAtInterruption: 0,
        scoreAtInterruption: 0,
        wicketsLostAtInterruption: 0,
        oversLost: 10,
      }];
      const par = dls.getCurrentParScore(
        250,
        50,
        true,
        50,
        20,
        2,
        interruptions,
      );

      const team2Resources = dls.getResourcePercentage(40, 0);
      const resourcesRemaining = dls.getResourcePercentage(20, 2);
      const expected = dls.calculateParScore(
        250,
        dls.getResourcePercentage(50, 0),
        team2Resources - resourcesRemaining,
      );
      expect(par).toBe(expected);
      expect(par).toBeGreaterThan(0);
      expect(par).toBeLessThan(250);
    });
  });
});
