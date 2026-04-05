import { describe, it, expect } from 'vitest';
import { DLSEngine } from './dls-engine';

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
    it('returns a par score during the chase', () => {
      const par = dls.getCurrentParScore(
        250,   // team 1 score
        50,    // team 1 total overs
        true,  // team 1 complete
        40,    // team 2 total overs (reduced)
        20,    // team 2 overs used so far
        2,     // team 2 wickets lost
        [{
          oversAtInterruption: 0,
          scoreAtInterruption: 0,
          wicketsLostAtInterruption: 0,
          oversLost: 10,
        }],
      );

      expect(par).toBeGreaterThan(0);
      expect(par).toBeLessThan(250);
    });
  });
});
