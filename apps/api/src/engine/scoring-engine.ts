import { db } from '../db/index';
import { delivery, over, innings, commentary } from '../db/schema/index';
import { battingScorecard, bowlingScorecard, fieldingScorecard } from '../db/schema/scorecard';
import { matchFormatConfig, match } from '../db/schema/index';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { DeliveryInput, Commentary as CommentaryType } from '@cricket/shared';
import { CommentaryEngine } from './commentary-engine';

export interface ScoringContext {
  matchId: string;
  inningsId: string;
  inningsNum: number;
  formatConfig: {
    oversPerInnings: number | null;
    ballsPerOver: number;
    maxBowlerOvers: number | null;
    inningsPerSide: number;
  };
  currentOver: {
    id: string;
    overNumber: number;
    legalBalls: number;
    totalBalls: number;
  } | null;
  inningsState: {
    totalRuns: number;
    totalWickets: number;
    totalOvers: number;
    totalExtras: number;
    targetScore: number | null;
  };
  undoStackPos: number;
}

export interface ScoringResult {
  delivery: typeof delivery.$inferSelect;
  commentary: CommentaryType;
  overCompleted: boolean;
  inningsCompleted: boolean;
  matchCompleted: boolean;
  newStrikerId: string;
  newNonStrikerId: string;
  scorecardSnapshot: {
    innings_score: number;
    innings_wickets: number;
    innings_overs: string;
    run_rate: number;
  };
}

/**
 * Scoring Engine — core ball-by-ball logic.
 *
 * Per context.md section 13:
 * - Delivery records are IMMUTABLE. Corrections create override records.
 * - undo_stack_pos and legal_ball_num are critical for scoring integrity.
 * - Uses Redis for live score cache reads on the hot path (TODO: integrate Redis).
 */
export class ScoringEngine {
  private commentaryEngine = new CommentaryEngine();

  /**
   * Record an immutable delivery event.
   */
  async recordDelivery(input: DeliveryInput): Promise<ScoringResult> {
    const context = await this.getContext(input.match_id, input.innings_num);

    // Determine legality
    const isLegal = input.extra_type !== 'wide' && input.extra_type !== 'noball';
    const totalRuns = input.runs_batsman + input.runs_extras;

    // Free-hit detection: check if previous delivery was a no-ball
    const previousDelivery = await db.query.delivery.findFirst({
      where: and(
        eq(delivery.inningsId, context.inningsId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
    });
    const isFreeHit = previousDelivery?.extraType === 'noball';

    // During free-hit, only run-out dismissals are valid (context.md section 5.10)
    if (isFreeHit && input.is_wicket && input.wicket_type !== 'run_out') {
      throw new Error('VALIDATION_ERROR: During a free-hit, only run-out dismissals are valid');
    }

    // Get or create the current over
    let currentOver = context.currentOver;
    const ballsPerOver = context.formatConfig.ballsPerOver;

    if (!currentOver || currentOver.legalBalls >= ballsPerOver) {
      const newOverNumber = currentOver ? currentOver.overNumber + 1 : 0; // 0-indexed per context.md
      const [newOver] = await db.insert(over).values({
        inningsId: context.inningsId,
        overNumber: newOverNumber,
        bowlerId: input.bowler_id,
      }).returning();
      currentOver = {
        id: newOver.id,
        overNumber: newOverNumber,
        legalBalls: 0,
        totalBalls: 0,
      };
    }

    // Compute ball numbers
    const newLegalBalls = isLegal ? currentOver.legalBalls + 1 : currentOver.legalBalls;
    const ballNum = currentOver.totalBalls + 1;
    const legalBallNum = isLegal
      ? (currentOver.overNumber * ballsPerOver) + newLegalBalls
      : (currentOver.overNumber * ballsPerOver) + currentOver.legalBalls;

    // Compute state snapshot AFTER this ball
    const newInningsScore = context.inningsState.totalRuns + totalRuns;
    const newInningsWickets = context.inningsState.totalWickets + (input.is_wicket ? 1 : 0);
    const oversCompleted = isLegal && newLegalBalls >= ballsPerOver
      ? currentOver.overNumber + 1
      : currentOver.overNumber;
    const ballsInCurrentOver = isLegal && newLegalBalls >= ballsPerOver
      ? 0
      : newLegalBalls;
    const inningsOversStr = `${oversCompleted}.${ballsInCurrentOver}`;
    const oversDecimal = oversCompleted + (ballsInCurrentOver / 10);
    const currentRunRate = oversDecimal > 0 ? newInningsScore / oversDecimal : 0;

    const nextUndoStackPos = context.undoStackPos + 1;

    // Insert immutable delivery record
    const [newDelivery] = await db.insert(delivery).values({
      matchId: input.match_id,
      inningsId: context.inningsId,
      overId: currentOver.id,
      overNum: currentOver.overNumber,
      ballNum,
      legalBallNum,
      bowlerId: input.bowler_id,
      strikerId: input.striker_id,
      nonStrikerId: input.non_striker_id,
      runsBatsman: input.runs_batsman,
      runsExtras: input.runs_extras,
      extraType: input.extra_type || null,
      totalRuns,
      isFreeHit,
      isWicket: input.is_wicket,
      wicketType: input.wicket_type || null,
      dismissedId: input.dismissed_id || null,
      fielderIds: input.fielder_ids || [],
      isRetiredHurt: input.is_retired_hurt || false,
      shotType: input.shot_type || null,
      landingX: input.landing_x?.toString() || null,
      landingY: input.landing_y?.toString() || null,
      wagonX: input.wagon_x?.toString() || null,
      wagonY: input.wagon_y?.toString() || null,
      paceKmh: input.pace_kmh?.toString() || null,
      swingType: input.swing_type || null,
      inningsScore: newInningsScore,
      inningsWickets: newInningsWickets,
      inningsOvers: inningsOversStr,
      runRate: currentRunRate.toFixed(2),
      undoStackPos: nextUndoStackPos,
    }).returning();

    // Generate commentary via pipeline (context.md section 7.2)
    const commentaryRecord = await this.commentaryEngine.generate({
      delivery: newDelivery,
      matchId: input.match_id,
      inningsNum: input.innings_num,
      overBall: `${currentOver.overNumber}.${ballNum}`,
      inningsScore: newInningsScore,
      inningsWickets: newInningsWickets,
      runRate: currentRunRate,
    });

    // Link commentary to delivery
    await db.update(delivery).set({
      commentaryId: commentaryRecord.id,
    }).where(eq(delivery.id, newDelivery.id));

    // Update over stats
    await db.update(over).set({
      legalBalls: newLegalBalls,
      totalBalls: currentOver.totalBalls + 1,
      runsConceded: sql`${over.runsConceded} + ${totalRuns}`,
      wicketsTaken: input.is_wicket ? sql`${over.wicketsTaken} + 1` : over.wicketsTaken,
    }).where(eq(over.id, currentOver.id));

    // Update innings totals
    await db.update(innings).set({
      totalRuns: newInningsScore,
      totalWickets: newInningsWickets,
      totalOvers: inningsOversStr,
      totalExtras: sql`${innings.totalExtras} + ${input.runs_extras}`,
    }).where(eq(innings.id, context.inningsId));

    // Update scorecards
    await this.updateBattingScorecard(input, context.inningsId, isLegal);
    await this.updateBowlingScorecard(input, context.inningsId, totalRuns, isLegal);

    if (input.is_wicket && input.fielder_ids?.length) {
      await this.updateFieldingScorecard(input, context.inningsId);
    }

    // Check completion conditions
    const overCompleted = isLegal && newLegalBalls >= ballsPerOver;
    const inningsCompleted = this.checkInningsCompletion(
      newInningsWickets,
      overCompleted ? currentOver.overNumber + 1 : null,
      context.formatConfig.oversPerInnings,
      newInningsScore,
      context.inningsState.targetScore,
    );

    if (overCompleted) {
      await db.update(over).set({
        maidens: sql`${over.runsConceded} = 0`,
      }).where(eq(over.id, currentOver.id));
    }

    if (inningsCompleted) {
      await db.update(innings).set({
        status: 'completed',
        allOut: newInningsWickets >= 10,
        endedAt: new Date(),
      }).where(eq(innings.id, context.inningsId));
    }

    const matchCompleted = inningsCompleted && await this.checkMatchCompletion(
      input.match_id, context.formatConfig.inningsPerSide,
    );

    // Striker rotation
    const { newStrikerId, newNonStrikerId } = this.resolveStrikerRotation(
      input.striker_id, input.non_striker_id,
      input.runs_batsman, input.extra_type === 'wide',
      isLegal, overCompleted,
      input.is_wicket, input.dismissed_id,
    );

    const scorecardSnapshot = {
      innings_score: newInningsScore,
      innings_wickets: newInningsWickets,
      innings_overs: inningsOversStr,
      run_rate: currentRunRate,
    };

    return {
      delivery: newDelivery,
      commentary: commentaryRecord as any,
      overCompleted,
      inningsCompleted,
      matchCompleted,
      newStrikerId,
      newNonStrikerId,
      scorecardSnapshot,
    };
  }

  /**
   * Undo the last delivery.
   * Per context.md: marks the delivery as overridden (immutable — does NOT delete).
   */
  async undoLastBall(matchId: string, inningsId: string): Promise<{ success: boolean; overriddenId?: string }> {
    const lastDelivery = await db.query.delivery.findFirst({
      where: and(
        eq(delivery.inningsId, inningsId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
    });

    if (!lastDelivery) return { success: false };

    // Mark as overridden (immutable — never delete)
    await db.update(delivery).set({
      isOverridden: true,
    }).where(eq(delivery.id, lastDelivery.id));

    // Revert innings totals to the snapshot of the ball before
    const previousDelivery = await db.query.delivery.findFirst({
      where: and(
        eq(delivery.inningsId, inningsId),
        eq(delivery.isOverridden, false),
      ),
      orderBy: [desc(delivery.undoStackPos)],
    });

    if (previousDelivery) {
      await db.update(innings).set({
        totalRuns: previousDelivery.inningsScore,
        totalWickets: previousDelivery.inningsWickets,
        totalOvers: previousDelivery.inningsOvers,
      }).where(eq(innings.id, inningsId));
    } else {
      // No previous ball — reset innings to zero
      await db.update(innings).set({
        totalRuns: 0,
        totalWickets: 0,
        totalOvers: '0.0',
        totalExtras: 0,
      }).where(eq(innings.id, inningsId));
    }

    return { success: true, overriddenId: lastDelivery.id };
  }

  /**
   * Correct a past delivery.
   * Per context.md: creates an override record, never mutates the original.
   */
  async correctDelivery(
    originalDeliveryId: string,
    correction: Partial<DeliveryInput>,
  ): Promise<{ success: boolean; newDeliveryId?: string }> {
    const original = await db.query.delivery.findFirst({
      where: eq(delivery.id, originalDeliveryId),
    });
    if (!original) return { success: false };

    // Mark original as overridden
    await db.update(delivery).set({
      isOverridden: true,
    }).where(eq(delivery.id, originalDeliveryId));

    // Create corrected record pointing back to original
    const context = await this.getContext(original.matchId, original.overNum); // simplified
    const nextUndoStackPos = context.undoStackPos + 1;

    const [corrected] = await db.insert(delivery).values({
      ...original,
      id: undefined as any, // generate new ID
      ...correction,
      overrideOfId: originalDeliveryId,
      undoStackPos: nextUndoStackPos,
      isOverridden: false,
      timestamp: new Date(),
    } as any).returning();

    return { success: true, newDeliveryId: corrected.id };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private resolveStrikerRotation(
    strikerId: string, nonStrikerId: string,
    batsmanRuns: number, isWide: boolean,
    isLegal: boolean, overCompleted: boolean,
    isWicket: boolean, dismissedId?: string | null,
  ): { newStrikerId: string; newNonStrikerId: string } {
    let newStriker = strikerId;
    let newNonStriker = nonStrikerId;

    // Odd runs cause a swap
    if (batsmanRuns % 2 === 1) {
      [newStriker, newNonStriker] = [newNonStriker, newStriker];
    }

    // End of over causes a swap
    if (overCompleted) {
      [newStriker, newNonStriker] = [newNonStriker, newStriker];
    }

    // Wicket — dismissed player needs replacement
    if (isWicket && dismissedId) {
      if (dismissedId === newStriker) {
        newStriker = 'PENDING_NEW_BATSMAN';
      } else if (dismissedId === newNonStriker) {
        newNonStriker = 'PENDING_NEW_BATSMAN';
      }
    }

    return { newStrikerId: newStriker, newNonStrikerId: newNonStriker };
  }

  private checkInningsCompletion(
    wickets: number, completedOverNumber: number | null,
    maxOvers: number | null, runs: number, target: number | null,
  ): boolean {
    if (wickets >= 10) return true;
    if (completedOverNumber !== null && maxOvers !== null && completedOverNumber >= maxOvers) return true;
    if (target !== null && runs >= target) return true;
    return false;
  }

  private async checkMatchCompletion(matchId: string, inningsPerSide: number): Promise<boolean> {
    const allInnings = await db.query.innings.findMany({
      where: eq(innings.matchId, matchId),
    });
    const completed = allInnings.filter(i => i.status === 'completed').length;

    if (inningsPerSide === 1 && completed >= 2) return true;
    if (inningsPerSide === 2 && completed >= 4) return true;
    return false;
  }

  private async getContext(matchId: string, inningsNumOrId: number | string): Promise<ScoringContext> {
    const matchData = await db.query.match.findFirst({ where: eq(match.id, matchId) });
    if (!matchData) throw new Error(`Match ${matchId} not found`);

    const formatConfig = await db.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, matchData.formatConfigId),
    });
    if (!formatConfig) throw new Error('Format config not found');

    // Find innings by number or ID
    const inningsData = typeof inningsNumOrId === 'number'
      ? await db.query.innings.findFirst({
          where: and(eq(innings.matchId, matchId), eq(innings.inningsNumber, inningsNumOrId)),
        })
      : await db.query.innings.findFirst({
          where: eq(innings.id, inningsNumOrId),
        });
    if (!inningsData) throw new Error(`Innings not found`);

    const latestOver = await db.query.over.findFirst({
      where: eq(over.inningsId, inningsData.id),
      orderBy: [desc(over.overNumber)],
    });

    // Get highest undo_stack_pos for this innings
    const latestDelivery = await db.query.delivery.findFirst({
      where: eq(delivery.inningsId, inningsData.id),
      orderBy: [desc(delivery.undoStackPos)],
    });

    return {
      matchId,
      inningsId: inningsData.id,
      inningsNum: inningsData.inningsNumber,
      formatConfig: {
        oversPerInnings: formatConfig.oversPerInnings,
        ballsPerOver: formatConfig.ballsPerOver,
        maxBowlerOvers: formatConfig.maxBowlerOvers,
        inningsPerSide: formatConfig.inningsPerSide,
      },
      currentOver: latestOver ? {
        id: latestOver.id,
        overNumber: latestOver.overNumber,
        legalBalls: latestOver.legalBalls,
        totalBalls: latestOver.totalBalls,
      } : null,
      inningsState: {
        totalRuns: inningsData.totalRuns,
        totalWickets: inningsData.totalWickets,
        totalOvers: parseFloat(inningsData.totalOvers),
        totalExtras: inningsData.totalExtras,
        targetScore: inningsData.targetScore,
      },
      undoStackPos: latestDelivery?.undoStackPos ?? 0,
    };
  }

  private async updateBattingScorecard(input: DeliveryInput, inningsId: string, isLegal: boolean) {
    const ballsFacedIncrement = input.extra_type === 'wide' ? 0 : 1;

    const existing = await db.query.battingScorecard.findFirst({
      where: and(
        eq(battingScorecard.inningsId, inningsId),
        eq(battingScorecard.playerId, input.striker_id),
      ),
    });

    if (existing) {
      const newRuns = existing.runsScored + input.runs_batsman;
      const newBalls = existing.ballsFaced + ballsFacedIncrement;
      await db.update(battingScorecard).set({
        runsScored: newRuns,
        ballsFaced: newBalls,
        fours: input.runs_batsman === 4 ? existing.fours + 1 : existing.fours,
        sixes: input.runs_batsman === 6 ? existing.sixes + 1 : existing.sixes,
        strikeRate: newBalls > 0 ? ((newRuns / newBalls) * 100).toFixed(2) : '0',
        dots: input.runs_batsman === 0 && input.extra_type !== 'wide' ? existing.dots + 1 : existing.dots,
        singles: input.runs_batsman === 1 ? existing.singles + 1 : existing.singles,
        doubles: input.runs_batsman === 2 ? existing.doubles + 1 : existing.doubles,
        triples: input.runs_batsman === 3 ? existing.triples + 1 : existing.triples,
        isOut: input.is_wicket && input.dismissed_id === input.striker_id,
        dismissalType: input.is_wicket && input.dismissed_id === input.striker_id
          ? input.wicket_type : existing.dismissalType,
        dismissedById: input.is_wicket && input.dismissed_id === input.striker_id
          ? input.bowler_id : existing.dismissedById,
        fielderId: input.is_wicket && input.dismissed_id === input.striker_id && input.fielder_ids?.[0]
          ? input.fielder_ids[0] : existing.fielderId,
      }).where(eq(battingScorecard.id, existing.id));
    }
  }

  private async updateBowlingScorecard(
    input: DeliveryInput, inningsId: string, totalRuns: number, isLegal: boolean,
  ) {
    const existing = await db.query.bowlingScorecard.findFirst({
      where: and(
        eq(bowlingScorecard.inningsId, inningsId),
        eq(bowlingScorecard.playerId, input.bowler_id),
      ),
    });

    if (existing) {
      const isBowlerWicket = input.is_wicket && this.isBowlerWicket(input.wicket_type);
      await db.update(bowlingScorecard).set({
        runsConceded: existing.runsConceded + totalRuns,
        wicketsTaken: isBowlerWicket ? existing.wicketsTaken + 1 : existing.wicketsTaken,
        dots: totalRuns === 0 && isLegal ? existing.dots + 1 : existing.dots,
        foursConceded: input.runs_batsman === 4 ? existing.foursConceded + 1 : existing.foursConceded,
        sixesConceded: input.runs_batsman === 6 ? existing.sixesConceded + 1 : existing.sixesConceded,
        wides: input.extra_type === 'wide' ? existing.wides + 1 : existing.wides,
        noBalls: input.extra_type === 'noball' ? existing.noBalls + 1 : existing.noBalls,
        extrasConceded: existing.extrasConceded + input.runs_extras,
      }).where(eq(bowlingScorecard.id, existing.id));
    }
  }

  private async updateFieldingScorecard(input: DeliveryInput, inningsId: string) {
    if (!input.fielder_ids?.length || !input.wicket_type) return;

    for (const fielderId of input.fielder_ids) {
      const existing = await db.query.fieldingScorecard.findFirst({
        where: and(
          eq(fieldingScorecard.inningsId, inningsId),
          eq(fieldingScorecard.playerId, fielderId),
        ),
      });
      if (!existing) continue;

      if (input.wicket_type === 'caught' || input.wicket_type === 'caught_and_bowled') {
        await db.update(fieldingScorecard).set({ catches: existing.catches + 1 })
          .where(eq(fieldingScorecard.id, existing.id));
      } else if (input.wicket_type === 'run_out') {
        await db.update(fieldingScorecard).set({ runOuts: existing.runOuts + 1 })
          .where(eq(fieldingScorecard.id, existing.id));
      } else if (input.wicket_type === 'stumped') {
        await db.update(fieldingScorecard).set({ stumpings: existing.stumpings + 1 })
          .where(eq(fieldingScorecard.id, existing.id));
      }
    }
  }

  private isBowlerWicket(wicketType?: string | null): boolean {
    if (!wicketType) return false;
    return ['bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'hit_wicket'].includes(wicketType);
  }
}

export const scoringEngine = new ScoringEngine();
