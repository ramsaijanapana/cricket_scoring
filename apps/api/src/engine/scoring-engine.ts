import { db, type TxOrDb } from '../db/index';
import { delivery, over, innings, commentary, partnership, auditLog } from '../db/schema/index';
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
    bowlerId: string;
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
 * - Uses Redis for live score cache reads on the hot path (see services/cache.ts).
 *
 * All mutating methods use SERIALIZABLE transactions to prevent concurrent corruption.
 */
export class ScoringEngine {
  private commentaryEngine = new CommentaryEngine();

  /**
   * Record an immutable delivery event.
   * Wrapped in a SERIALIZABLE transaction — all reads and writes are atomic.
   */
  async recordDelivery(input: DeliveryInput, clientId?: string): Promise<ScoringResult> {
    return db.transaction(async (tx) => {
      const context = await this.getContext(input.matchId, input.inningsNum, tx);

      // Dead ball: record for audit trail but don't count anything
      if (input.isDeadBall) {
        const nextUndoStackPos = context.undoStackPos + 1;
        const activeOver = context.currentOver;
        if (!activeOver) {
          throw new Error('VALIDATION_ERROR: No active over for dead ball recording');
        }

        const [deadBallDelivery] = await tx.insert(delivery).values({
          matchId: input.matchId,
          inningsId: context.inningsId,
          overId: activeOver.id,
          overNum: activeOver.overNumber,
          ballNum: activeOver.totalBalls + 1,
          legalBallNum: activeOver.overNumber * context.formatConfig.ballsPerOver + activeOver.legalBalls,
          bowlerId: input.bowlerId,
          strikerId: input.strikerId,
          nonStrikerId: input.nonStrikerId,
          runsBatsman: 0,
          runsExtras: 0,
          extraType: null,
          totalRuns: 0,
          isFreeHit: false,
          isWicket: false,
          wicketType: null,
          dismissedId: null,
          fielderIds: [],
          isRetiredHurt: false,
          isDeadBall: true,
          inningsScore: context.inningsState.totalRuns,
          inningsWickets: context.inningsState.totalWickets,
          inningsOvers: String(context.inningsState.totalOvers),
          runRate: '0',
          undoStackPos: nextUndoStackPos,
          clientId: clientId || null,
        }).returning();

        await tx.insert(auditLog).values({
          userId: (input as any).scorerId || null,
          matchId: input.matchId,
          action: 'delivery_recorded',
          entityType: 'delivery',
          entityId: deadBallDelivery.id,
          after: { isDeadBall: true },
        });

        const commentaryRecord = await this.commentaryEngine.generate({
          delivery: deadBallDelivery,
          matchId: input.matchId,
          inningsNum: input.inningsNum,
          overBall: `${activeOver.overNumber}.${activeOver.totalBalls + 1}`,
          inningsScore: context.inningsState.totalRuns,
          inningsWickets: context.inningsState.totalWickets,
          runRate: 0,
        }, tx);

        return {
          delivery: deadBallDelivery,
          commentary: commentaryRecord as any,
          overCompleted: false,
          inningsCompleted: false,
          matchCompleted: false,
          newStrikerId: input.strikerId,
          newNonStrikerId: input.nonStrikerId,
          scorecardSnapshot: {
            innings_score: context.inningsState.totalRuns,
            innings_wickets: context.inningsState.totalWickets,
            innings_overs: String(context.inningsState.totalOvers),
            run_rate: 0,
          },
        };
      }

      // Determine legality
      const isLegal = input.extraType !== 'wide' && input.extraType !== 'noball';
      const totalRuns = input.runsBatsman + input.runsExtras;

      // Free-hit detection: check if previous delivery was a no-ball
      const previousDelivery = await tx.query.delivery.findFirst({
        where: and(
          eq(delivery.inningsId, context.inningsId),
          eq(delivery.isOverridden, false),
        ),
        orderBy: [desc(delivery.overNum), desc(delivery.ballNum), desc(delivery.undoStackPos)],
      });
      const isFreeHit = previousDelivery?.extraType === 'noball';

      // During free-hit, only run-out dismissals are valid (context.md section 5.10)
      if (isFreeHit && input.isWicket && input.wicketType !== 'run_out') {
        throw new Error('VALIDATION_ERROR: During a free-hit, only run-out dismissals are valid');
      }

      // Bowler overs limit validation (context.md section 5.8)
      if (context.formatConfig.maxBowlerOvers) {
        const bowlerOvers = await tx.query.over.findMany({
          where: and(
            eq(over.inningsId, context.inningsId),
            eq(over.bowlerId, input.bowlerId),
          ),
        });
        const completedOvers = bowlerOvers.filter(o => o.legalBalls >= context.formatConfig.ballsPerOver).length;
        if (completedOvers >= context.formatConfig.maxBowlerOvers) {
          throw new Error(`VALIDATION_ERROR: Bowler has reached maximum overs limit (${context.formatConfig.maxBowlerOvers})`);
        }
      }

      // Get or create the current over
      let currentOver = context.currentOver;
      const ballsPerOver = context.formatConfig.ballsPerOver;

      if (!currentOver || currentOver.legalBalls >= ballsPerOver) {
        // Enforce: same bowler cannot bowl consecutive overs
        if (currentOver && currentOver.legalBalls >= ballsPerOver && currentOver.bowlerId === input.bowlerId) {
          throw new Error('VALIDATION_ERROR: Same bowler cannot bowl consecutive overs. Please select a different bowler.');
        }
        const newOverNumber = currentOver ? currentOver.overNumber + 1 : 0; // 0-indexed per context.md
        const [newOver] = await tx.insert(over).values({
          inningsId: context.inningsId,
          overNumber: newOverNumber,
          bowlerId: input.bowlerId,
        }).returning();
        currentOver = {
          id: newOver.id,
          overNumber: newOverNumber,
          legalBalls: 0,
          totalBalls: 0,
          bowlerId: input.bowlerId,
        };
      }

      // At this point currentOver is guaranteed non-null
      const activeOver = currentOver!;

      // Compute ball numbers
      const newLegalBalls = isLegal ? activeOver.legalBalls + 1 : activeOver.legalBalls;
      const ballNum = activeOver.totalBalls + 1;
      const legalBallNum = isLegal
        ? (activeOver.overNumber * ballsPerOver) + newLegalBalls
        : (activeOver.overNumber * ballsPerOver) + activeOver.legalBalls;

      // Compute state snapshot AFTER this ball
      const newInningsScore = context.inningsState.totalRuns + totalRuns;
      const newInningsWickets = context.inningsState.totalWickets + (input.isWicket ? 1 : 0);
      const oversCompleted = isLegal && newLegalBalls >= ballsPerOver
        ? activeOver.overNumber + 1
        : activeOver.overNumber;
      const ballsInCurrentOver = isLegal && newLegalBalls >= ballsPerOver
        ? 0
        : newLegalBalls;
      const inningsOversStr = `${oversCompleted}.${ballsInCurrentOver}`;
      const totalBallsBowled = oversCompleted * ballsPerOver + ballsInCurrentOver;
      const currentRunRate = totalBallsBowled > 0 ? (newInningsScore / totalBallsBowled) * ballsPerOver : 0;

      const nextUndoStackPos = context.undoStackPos + 1;

      // Insert immutable delivery record
      const [newDelivery] = await tx.insert(delivery).values({
        matchId: input.matchId,
        inningsId: context.inningsId,
        overId: activeOver.id,
        overNum: activeOver.overNumber,
        ballNum,
        legalBallNum,
        bowlerId: input.bowlerId,
        strikerId: input.strikerId,
        nonStrikerId: input.nonStrikerId,
        runsBatsman: input.runsBatsman,
        runsExtras: input.runsExtras,
        extraType: input.extraType || null,
        totalRuns,
        isFreeHit,
        isWicket: input.isWicket,
        wicketType: input.wicketType || null,
        dismissedId: input.dismissedId || null,
        fielderIds: input.fielderIds || [],
        isRetiredHurt: input.isRetiredHurt || false,
        shotType: input.shotType || null,
        landingX: input.landingX?.toString() || null,
        landingY: input.landingY?.toString() || null,
        wagonX: input.wagonX?.toString() || null,
        wagonY: input.wagonY?.toString() || null,
        paceKmh: input.paceKmh?.toString() || null,
        swingType: input.swingType || null,
        inningsScore: newInningsScore,
        inningsWickets: newInningsWickets,
        inningsOvers: inningsOversStr,
        runRate: currentRunRate.toFixed(2),
        undoStackPos: nextUndoStackPos,
        clientId: clientId || null,
      }).returning();

      // Audit log: delivery recorded
      await tx.insert(auditLog).values({
        userId: (input as any).scorerId || null,
        matchId: input.matchId,
        action: 'delivery_recorded',
        entityType: 'delivery',
        entityId: newDelivery.id,
        after: { runs: input.runsBatsman, extras: input.runsExtras, extraType: input.extraType || null, isWicket: input.isWicket },
      });

      // Generate commentary via pipeline (context.md section 7.2)
      const commentaryRecord = await this.commentaryEngine.generate({
        delivery: newDelivery,
        matchId: input.matchId,
        inningsNum: input.inningsNum,
        overBall: `${activeOver.overNumber}.${ballNum}`,
        inningsScore: newInningsScore,
        inningsWickets: newInningsWickets,
        runRate: currentRunRate,
      }, tx);

      // Link commentary to delivery
      await tx.update(delivery).set({
        commentaryId: commentaryRecord.id,
      }).where(eq(delivery.id, newDelivery.id));

      // Update over stats
      await tx.update(over).set({
        legalBalls: newLegalBalls,
        totalBalls: activeOver.totalBalls + 1,
        runsConceded: sql`${over.runsConceded} + ${totalRuns}`,
        wicketsTaken: input.isWicket ? sql`${over.wicketsTaken} + 1` : over.wicketsTaken,
      }).where(eq(over.id, activeOver.id));

      // Update innings totals
      await tx.update(innings).set({
        totalRuns: newInningsScore,
        totalWickets: newInningsWickets,
        totalOvers: inningsOversStr,
        totalExtras: sql`${innings.totalExtras} + ${input.runsExtras}`,
      }).where(eq(innings.id, context.inningsId));

      // Update scorecards
      await this.updateBattingScorecard(input, context.inningsId, isLegal, tx);
      await this.updateBowlingScorecard(input, context.inningsId, totalRuns, isLegal, tx);

      if (input.isWicket && input.fielderIds?.length) {
        await this.updateFieldingScorecard(input, context.inningsId, tx);
      }

      // Update partnership tracking
      await this.updatePartnership(input, context.inningsId, totalRuns, isLegal, newInningsScore, tx);

      // Check completion conditions
      const overCompleted = isLegal && newLegalBalls >= ballsPerOver;
      const inningsCompleted = this.checkInningsCompletion(
        newInningsWickets,
        overCompleted ? activeOver.overNumber + 1 : null,
        context.formatConfig.oversPerInnings,
        newInningsScore,
        context.inningsState.targetScore,
      );

      if (overCompleted) {
        // Read the over's final runsConceded after this ball
        const completedOver = await tx.query.over.findFirst({
          where: eq(over.id, activeOver.id),
        });
        const isMaiden = completedOver !== undefined && completedOver.runsConceded === 0;

        await tx.update(over).set({
          maidens: isMaiden,
        }).where(eq(over.id, activeOver.id));

        // Update bowler's maiden count in bowling scorecard
        if (isMaiden) {
          const bowlerCard = await tx.query.bowlingScorecard.findFirst({
            where: and(
              eq(bowlingScorecard.inningsId, context.inningsId),
              eq(bowlingScorecard.playerId, input.bowlerId),
            ),
          });
          if (bowlerCard) {
            await tx.update(bowlingScorecard).set({
              maidens: bowlerCard.maidens + 1,
            }).where(eq(bowlingScorecard.id, bowlerCard.id));
          }
        }
      }

      if (inningsCompleted) {
        await tx.update(innings).set({
          status: 'completed',
          allOut: newInningsWickets >= 10,
          endedAt: new Date(),
        }).where(eq(innings.id, context.inningsId));
      }

      const matchCompleted = inningsCompleted && await this.checkMatchCompletion(
        input.matchId, context.formatConfig.inningsPerSide, tx,
      );

      // Striker rotation
      const { newStrikerId, newNonStrikerId } = this.resolveStrikerRotation(
        input.strikerId, input.nonStrikerId,
        input.runsBatsman, input.extraType === 'wide',
        isLegal, overCompleted,
        input.isWicket, input.dismissedId,
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
    });
  }

  /**
   * Undo the last delivery.
   * Per context.md: marks the delivery as overridden (immutable — does NOT delete).
   * Wrapped in a transaction for atomicity.
   */
  async undoLastBall(matchId: string, inningsId: string): Promise<{ success: boolean; overriddenId?: string }> {
    return db.transaction(async (tx) => {
      const lastDelivery = await tx.query.delivery.findFirst({
        where: and(
          eq(delivery.inningsId, inningsId),
          eq(delivery.isOverridden, false),
        ),
        orderBy: [desc(delivery.undoStackPos)],
      });

      if (!lastDelivery) return { success: false };

      // Mark as overridden (immutable — never delete)
      await tx.update(delivery).set({
        isOverridden: true,
      }).where(eq(delivery.id, lastDelivery.id));

      // Audit log: delivery undone
      await tx.insert(auditLog).values({
        matchId,
        action: 'delivery_undone',
        entityType: 'delivery',
        entityId: lastDelivery.id,
        before: { runs: lastDelivery.runsBatsman, extras: lastDelivery.runsExtras, is_wicket: lastDelivery.isWicket },
      });

      // Find the previous (now-latest) non-overridden delivery
      const previousDelivery = await tx.query.delivery.findFirst({
        where: and(
          eq(delivery.inningsId, inningsId),
          eq(delivery.isOverridden, false),
        ),
        orderBy: [desc(delivery.undoStackPos)],
      });

      // Derived values from the undone delivery
      const isLegal = lastDelivery.extraType !== 'wide' && lastDelivery.extraType !== 'noball';
      const totalRuns = lastDelivery.totalRuns;
      const ballsFacedDecrement = lastDelivery.extraType === 'wide' ? 0 : 1;
      const isBowlerWicket = lastDelivery.isWicket && this.isBowlerWicket(lastDelivery.wicketType);

      // ── 1. Revert innings totals ──────────────────────────────────────────
      if (previousDelivery) {
        const extrasToSubtract = lastDelivery.runsExtras;
        await tx.update(innings).set({
          totalRuns: previousDelivery.inningsScore,
          totalWickets: previousDelivery.inningsWickets,
          totalOvers: previousDelivery.inningsOvers,
          totalExtras: extrasToSubtract > 0
            ? sql`${innings.totalExtras} - ${extrasToSubtract}`
            : innings.totalExtras,
          // If innings was marked completed by this delivery, reopen it
          status: 'in_progress',
          allOut: false,
          endedAt: null,
        }).where(eq(innings.id, inningsId));
      } else {
        await tx.update(innings).set({
          totalRuns: 0,
          totalWickets: 0,
          totalOvers: '0.0',
          totalExtras: 0,
          status: 'in_progress',
          allOut: false,
          endedAt: null,
        }).where(eq(innings.id, inningsId));
      }

      // ── 2. Revert batting scorecard ───────────────────────────────────────
      const batCard = await tx.query.battingScorecard.findFirst({
        where: and(
          eq(battingScorecard.inningsId, inningsId),
          eq(battingScorecard.playerId, lastDelivery.strikerId),
        ),
      });
      if (batCard) {
        const newRuns = batCard.runsScored - lastDelivery.runsBatsman;
        const newBalls = batCard.ballsFaced - ballsFacedDecrement;
        const wasStrikerDismissed = lastDelivery.isWicket && lastDelivery.dismissedId === lastDelivery.strikerId;

        await tx.update(battingScorecard).set({
          runsScored: newRuns,
          ballsFaced: newBalls,
          fours: lastDelivery.runsBatsman === 4 ? batCard.fours - 1 : batCard.fours,
          sixes: lastDelivery.runsBatsman === 6 ? batCard.sixes - 1 : batCard.sixes,
          strikeRate: newBalls > 0 ? ((newRuns / newBalls) * 100).toFixed(2) : '0',
          dots: lastDelivery.runsBatsman === 0 && lastDelivery.extraType !== 'wide'
            ? batCard.dots - 1 : batCard.dots,
          singles: lastDelivery.runsBatsman === 1 ? batCard.singles - 1 : batCard.singles,
          doubles: lastDelivery.runsBatsman === 2 ? batCard.doubles - 1 : batCard.doubles,
          triples: lastDelivery.runsBatsman === 3 ? batCard.triples - 1 : batCard.triples,
          // If this delivery dismissed the striker, revert dismissal
          isOut: wasStrikerDismissed ? false : batCard.isOut,
          dismissalType: wasStrikerDismissed ? null : batCard.dismissalType,
          dismissedById: wasStrikerDismissed ? null : batCard.dismissedById,
          fielderId: wasStrikerDismissed ? null : batCard.fielderId,
        }).where(eq(battingScorecard.id, batCard.id));
      }

      // Also handle non-striker dismissal (e.g., run-out of non-striker)
      if (lastDelivery.isWicket && lastDelivery.dismissedId && lastDelivery.dismissedId !== lastDelivery.strikerId) {
        const nonStrikerCard = await tx.query.battingScorecard.findFirst({
          where: and(
            eq(battingScorecard.inningsId, inningsId),
            eq(battingScorecard.playerId, lastDelivery.dismissedId),
          ),
        });
        if (nonStrikerCard) {
          await tx.update(battingScorecard).set({
            isOut: false,
            dismissalType: null,
            dismissedById: null,
            fielderId: null,
          }).where(eq(battingScorecard.id, nonStrikerCard.id));
        }
      }

      // ── 3. Revert bowling scorecard ───────────────────────────────────────
      const bowlCard = await tx.query.bowlingScorecard.findFirst({
        where: and(
          eq(bowlingScorecard.inningsId, inningsId),
          eq(bowlingScorecard.playerId, lastDelivery.bowlerId),
        ),
      });
      if (bowlCard) {
        // Decrement oversBowled if legal ball
        let newOversBowled = bowlCard.oversBowled;
        if (isLegal) {
          const parts = String(bowlCard.oversBowled).split('.');
          const completedOvers = parseInt(parts[0], 10) || 0;
          const currentBalls = parseInt(parts[1], 10) || 0;
          if (currentBalls > 0) {
            newOversBowled = `${completedOvers}.${currentBalls - 1}`;
          } else if (completedOvers > 0) {
            // Roll back from X.0 to (X-1).5
            newOversBowled = `${completedOvers - 1}.5`;
          } else {
            newOversBowled = '0.0';
          }
        }

        const newRunsConceded = bowlCard.runsConceded - totalRuns;

        // Recalculate economy rate
        const oversParts = String(newOversBowled).split('.');
        const oversWhole = parseInt(oversParts[0], 10) || 0;
        const oversBalls = parseInt(oversParts[1], 10) || 0;
        const totalBallsBowled = oversWhole * 6 + oversBalls;
        const economyRate = totalBallsBowled > 0 ? ((newRunsConceded / totalBallsBowled) * 6).toFixed(2) : '0.00';

        await tx.update(bowlingScorecard).set({
          oversBowled: newOversBowled,
          runsConceded: newRunsConceded,
          wicketsTaken: isBowlerWicket ? bowlCard.wicketsTaken - 1 : bowlCard.wicketsTaken,
          economyRate,
          dots: totalRuns === 0 && isLegal ? bowlCard.dots - 1 : bowlCard.dots,
          foursConceded: lastDelivery.runsBatsman === 4 ? bowlCard.foursConceded - 1 : bowlCard.foursConceded,
          sixesConceded: lastDelivery.runsBatsman === 6 ? bowlCard.sixesConceded - 1 : bowlCard.sixesConceded,
          wides: lastDelivery.extraType === 'wide' ? bowlCard.wides - 1 : bowlCard.wides,
          noBalls: lastDelivery.extraType === 'noball' ? bowlCard.noBalls - 1 : bowlCard.noBalls,
          extrasConceded: bowlCard.extrasConceded - lastDelivery.runsExtras,
        }).where(eq(bowlingScorecard.id, bowlCard.id));
      }

      // ── 4. Revert fielding scorecard ──────────────────────────────────────
      if (lastDelivery.isWicket && lastDelivery.fielderIds?.length && lastDelivery.wicketType) {
        for (const fielderId of lastDelivery.fielderIds) {
          const fieldCard = await tx.query.fieldingScorecard.findFirst({
            where: and(
              eq(fieldingScorecard.inningsId, inningsId),
              eq(fieldingScorecard.playerId, fielderId),
            ),
          });
          if (!fieldCard) continue;

          if (lastDelivery.wicketType === 'caught' || lastDelivery.wicketType === 'caught_and_bowled') {
            await tx.update(fieldingScorecard).set({ catches: fieldCard.catches - 1 })
              .where(eq(fieldingScorecard.id, fieldCard.id));
          } else if (lastDelivery.wicketType === 'run_out') {
            await tx.update(fieldingScorecard).set({ runOuts: fieldCard.runOuts - 1 })
              .where(eq(fieldingScorecard.id, fieldCard.id));
          } else if (lastDelivery.wicketType === 'stumped') {
            await tx.update(fieldingScorecard).set({ stumpings: fieldCard.stumpings - 1 })
              .where(eq(fieldingScorecard.id, fieldCard.id));
          }
        }
      }

      // ── 5. Revert partnership ─────────────────────────────────────────────
      // If the delivery caused a wicket, it ended the active partnership. Reopen it.
      if (lastDelivery.isWicket) {
        // The most recently ended partnership is the one this delivery closed
        const endedPartnership = await tx.query.partnership.findFirst({
          where: and(
            eq(partnership.inningsId, inningsId),
            eq(partnership.isActive, false),
          ),
          orderBy: [desc(partnership.createdAt)],
        });

        if (endedPartnership) {
          // Reopen and decrement runs/balls
          const ballsDecrement = lastDelivery.extraType === 'wide' ? 0 : 1;
          await tx.update(partnership).set({
            isActive: true,
            endedAtRuns: null,
            runs: endedPartnership.runs - totalRuns,
            balls: endedPartnership.balls - ballsDecrement,
          }).where(eq(partnership.id, endedPartnership.id));
        }

        // A new partnership may have been created after this wicket by a subsequent
        // delivery. But since this is the LAST delivery, no subsequent partnership
        // should exist. However, if the wicket-delivery logic created a new partnership
        // record, we don't need to worry — the updatePartnership only ends the active
        // one on wicket; it doesn't create a new one until the next delivery.
      } else {
        // Non-wicket delivery — just decrement the active partnership
        const activePartnership = await tx.query.partnership.findFirst({
          where: and(
            eq(partnership.inningsId, inningsId),
            eq(partnership.isActive, true),
          ),
        });

        if (activePartnership) {
          const ballsDecrement = lastDelivery.extraType === 'wide' ? 0 : 1;
          await tx.update(partnership).set({
            runs: activePartnership.runs - totalRuns,
            balls: activePartnership.balls - ballsDecrement,
          }).where(eq(partnership.id, activePartnership.id));
        }
      }

      // ── 6. Revert over stats ──────────────────────────────────────────────
      const overRecord = await tx.query.over.findFirst({
        where: eq(over.id, lastDelivery.overId),
      });

      if (overRecord) {
        const newLegalBalls = isLegal ? overRecord.legalBalls - 1 : overRecord.legalBalls;
        const newTotalBalls = overRecord.totalBalls - 1;

        if (newTotalBalls <= 0) {
          // This was the first (and only) ball of this over — delete the over entirely
          await tx.delete(over).where(eq(over.id, overRecord.id));
        } else {
          // Revert maiden flag if this delivery completed the over and it was marked maiden
          const wasMaiden = overRecord.maidens;
          // If the over was marked as maiden and we're undoing the completing ball,
          // revert the maiden flag. The over is no longer complete after undo.
          const revertMaiden = wasMaiden && isLegal && overRecord.legalBalls >= 6;

          await tx.update(over).set({
            legalBalls: newLegalBalls,
            totalBalls: newTotalBalls,
            runsConceded: sql`${over.runsConceded} - ${totalRuns}`,
            wicketsTaken: lastDelivery.isWicket ? sql`${over.wicketsTaken} - 1` : over.wicketsTaken,
            maidens: revertMaiden ? false : overRecord.maidens,
          }).where(eq(over.id, overRecord.id));

          // If we reverted a maiden, also decrement the bowler's maiden count
          if (revertMaiden && bowlCard) {
            await tx.update(bowlingScorecard).set({
              maidens: bowlCard.maidens - 1,
            }).where(eq(bowlingScorecard.id, bowlCard.id));
          }
        }
      }

      return { success: true, overriddenId: lastDelivery.id };
    });
  }

  /**
   * Correct a past delivery.
   * Per context.md: creates an override record, never mutates the original.
   */
  async correctDelivery(
    originalDeliveryId: string,
    correction: Partial<DeliveryInput>,
  ): Promise<{ success: boolean; newDeliveryId?: string }> {
    return db.transaction(async (tx) => {
      const original = await tx.query.delivery.findFirst({
        where: eq(delivery.id, originalDeliveryId),
      });
      if (!original) return { success: false };

      // Mark original as overridden
      await tx.update(delivery).set({
        isOverridden: true,
      }).where(eq(delivery.id, originalDeliveryId));

      // Create corrected record pointing back to original
      const context = await this.getContext(original.matchId, original.overNum, tx); // simplified
      const nextUndoStackPos = context.undoStackPos + 1;

      const [corrected] = await tx.insert(delivery).values({
        ...original,
        id: undefined as any, // generate new ID
        ...correction,
        overrideOfId: originalDeliveryId,
        undoStackPos: nextUndoStackPos,
        isOverridden: false,
        timestamp: new Date(),
      } as any).returning();

      // Audit log: delivery corrected
      await tx.insert(auditLog).values({
        matchId: original.matchId,
        action: 'delivery_corrected',
        entityType: 'delivery',
        entityId: corrected.id,
        before: { runs: original.runsBatsman, extras: original.runsExtras, is_wicket: original.isWicket },
        after: { ...correction, overrideOfId: originalDeliveryId },
      });

      return { success: true, newDeliveryId: corrected.id };
    });
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

  private async checkMatchCompletion(matchId: string, inningsPerSide: number, tx: TxOrDb = db): Promise<boolean> {
    const allInnings = await tx.query.innings.findMany({
      where: eq(innings.matchId, matchId),
    });
    const completed = allInnings.filter(i => i.status === 'completed').length;

    if (inningsPerSide === 1 && completed >= 2) return true;
    if (inningsPerSide === 2 && completed >= 4) return true;
    return false;
  }

  private async getContext(matchId: string, inningsNumOrId: number | string, tx: TxOrDb = db): Promise<ScoringContext> {
    const matchData = await tx.query.match.findFirst({ where: eq(match.id, matchId) });
    if (!matchData) throw new Error(`Match ${matchId} not found`);

    const formatConfig = await tx.query.matchFormatConfig.findFirst({
      where: eq(matchFormatConfig.id, matchData.formatConfigId),
    });
    if (!formatConfig) throw new Error('Format config not found');

    // Find innings by number or ID
    const inningsData = typeof inningsNumOrId === 'number'
      ? await tx.query.innings.findFirst({
          where: and(eq(innings.matchId, matchId), eq(innings.inningsNumber, inningsNumOrId)),
        })
      : await tx.query.innings.findFirst({
          where: eq(innings.id, inningsNumOrId),
        });
    if (!inningsData) throw new Error(`Innings not found`);

    const latestOver = await tx.query.over.findFirst({
      where: eq(over.inningsId, inningsData.id),
      orderBy: [desc(over.overNumber)],
    });

    // Get highest undo_stack_pos for this innings
    const latestDelivery = await tx.query.delivery.findFirst({
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
        bowlerId: latestOver.bowlerId,
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

  private async updateBattingScorecard(input: DeliveryInput, inningsId: string, isLegal: boolean, tx: TxOrDb = db) {
    const ballsFacedIncrement = input.extraType === 'wide' ? 0 : 1;

    const existing = await tx.query.battingScorecard.findFirst({
      where: and(
        eq(battingScorecard.inningsId, inningsId),
        eq(battingScorecard.playerId, input.strikerId),
      ),
    });

    if (existing) {
      const newRuns = existing.runsScored + input.runsBatsman;
      const newBalls = existing.ballsFaced + ballsFacedIncrement;
      await tx.update(battingScorecard).set({
        runsScored: newRuns,
        ballsFaced: newBalls,
        fours: input.runsBatsman === 4 ? existing.fours + 1 : existing.fours,
        sixes: input.runsBatsman === 6 ? existing.sixes + 1 : existing.sixes,
        strikeRate: newBalls > 0 ? ((newRuns / newBalls) * 100).toFixed(2) : '0',
        dots: input.runsBatsman === 0 && input.extraType !== 'wide' ? existing.dots + 1 : existing.dots,
        singles: input.runsBatsman === 1 ? existing.singles + 1 : existing.singles,
        doubles: input.runsBatsman === 2 ? existing.doubles + 1 : existing.doubles,
        triples: input.runsBatsman === 3 ? existing.triples + 1 : existing.triples,
        isOut: input.isWicket && input.dismissedId === input.strikerId,
        dismissalType: input.isWicket && input.dismissedId === input.strikerId
          ? input.wicketType : existing.dismissalType,
        dismissedById: input.isWicket && input.dismissedId === input.strikerId
          ? input.bowlerId : existing.dismissedById,
        fielderId: input.isWicket && input.dismissedId === input.strikerId && input.fielderIds?.[0]
          ? input.fielderIds[0] : existing.fielderId,
      }).where(eq(battingScorecard.id, existing.id));
    } else {
      // Insert new batting scorecard record if none exists (upsert pattern)
      const inningsData = await tx.query.innings.findFirst({
        where: eq(innings.id, inningsId),
      });
      await tx.insert(battingScorecard).values({
        inningsId,
        playerId: input.strikerId,
        teamId: inningsData!.battingTeamId,
        battingPosition: 0, // will be corrected by innings setup
        runsScored: input.runsBatsman,
        ballsFaced: ballsFacedIncrement,
        fours: input.runsBatsman === 4 ? 1 : 0,
        sixes: input.runsBatsman === 6 ? 1 : 0,
        strikeRate: ballsFacedIncrement > 0 ? ((input.runsBatsman / ballsFacedIncrement) * 100).toFixed(2) : '0',
        dots: input.runsBatsman === 0 && input.extraType !== 'wide' ? 1 : 0,
        singles: input.runsBatsman === 1 ? 1 : 0,
        doubles: input.runsBatsman === 2 ? 1 : 0,
        triples: input.runsBatsman === 3 ? 1 : 0,
        isOut: input.isWicket && input.dismissedId === input.strikerId,
        dismissalType: input.isWicket && input.dismissedId === input.strikerId
          ? input.wicketType : null,
        dismissedById: input.isWicket && input.dismissedId === input.strikerId
          ? input.bowlerId : null,
        fielderId: input.isWicket && input.dismissedId === input.strikerId && input.fielderIds?.[0]
          ? input.fielderIds[0] : null,
        didNotBat: false,
      });
    }
  }

  private async updateBowlingScorecard(
    input: DeliveryInput, inningsId: string, totalRuns: number, isLegal: boolean, tx: TxOrDb = db,
  ) {
    const existing = await tx.query.bowlingScorecard.findFirst({
      where: and(
        eq(bowlingScorecard.inningsId, inningsId),
        eq(bowlingScorecard.playerId, input.bowlerId),
      ),
    });

    if (existing) {
      const isBowlerWicket = input.isWicket && this.isBowlerWicket(input.wicketType);

      // Calculate updated oversBowled (e.g., "2.3" = 2 overs and 3 balls)
      // Use string splitting to avoid floating-point precision issues
      let newOversBowled = existing.oversBowled;
      if (isLegal) {
        const parts = String(existing.oversBowled).split('.');
        const completedOvers = parseInt(parts[0], 10) || 0;
        const currentBalls = parseInt(parts[1], 10) || 0;
        const totalBalls = currentBalls + 1;
        if (totalBalls >= 6) {
          newOversBowled = `${completedOvers + 1}.0`;
        } else {
          newOversBowled = `${completedOvers}.${totalBalls}`;
        }
      }

      // Calculate economy rate
      const newRuns = existing.runsConceded + totalRuns;
      const oversParts = String(newOversBowled).split('.');
      const oversWhole = parseInt(oversParts[0], 10) || 0;
      const oversBalls = parseInt(oversParts[1], 10) || 0;
      const totalBallsBowled = oversWhole * 6 + oversBalls;
      const economyRate = totalBallsBowled > 0 ? ((newRuns / totalBallsBowled) * 6).toFixed(2) : '0.00';

      await tx.update(bowlingScorecard).set({
        oversBowled: newOversBowled,
        runsConceded: newRuns,
        wicketsTaken: isBowlerWicket ? existing.wicketsTaken + 1 : existing.wicketsTaken,
        economyRate,
        dots: totalRuns === 0 && isLegal ? existing.dots + 1 : existing.dots,
        foursConceded: input.runsBatsman === 4 ? existing.foursConceded + 1 : existing.foursConceded,
        sixesConceded: input.runsBatsman === 6 ? existing.sixesConceded + 1 : existing.sixesConceded,
        wides: input.extraType === 'wide' ? existing.wides + 1 : existing.wides,
        noBalls: input.extraType === 'noball' ? existing.noBalls + 1 : existing.noBalls,
        extrasConceded: existing.extrasConceded + input.runsExtras,
      }).where(eq(bowlingScorecard.id, existing.id));
    } else {
      // Create new bowling scorecard entry if none exists
      const inningsData = await tx.query.innings.findFirst({
        where: eq(innings.id, inningsId),
      });
      const legalBall = isLegal ? 1 : 0;
      const oversStr = legalBall > 0 ? '0.1' : '0.0';
      const econ = legalBall > 0 ? (totalRuns * 6).toFixed(2) : '0.00';

      await tx.insert(bowlingScorecard).values({
        inningsId,
        playerId: input.bowlerId,
        teamId: inningsData!.bowlingTeamId,
        bowlingPosition: 0,
        oversBowled: oversStr,
        runsConceded: totalRuns,
        wicketsTaken: input.isWicket && this.isBowlerWicket(input.wicketType) ? 1 : 0,
        economyRate: econ,
        dots: totalRuns === 0 && isLegal ? 1 : 0,
        foursConceded: input.runsBatsman === 4 ? 1 : 0,
        sixesConceded: input.runsBatsman === 6 ? 1 : 0,
        wides: input.extraType === 'wide' ? 1 : 0,
        noBalls: input.extraType === 'noball' ? 1 : 0,
        extrasConceded: input.runsExtras,
      });
    }
  }

  private async updateFieldingScorecard(input: DeliveryInput, inningsId: string, tx: TxOrDb = db) {
    if (!input.fielderIds?.length || !input.wicketType) return;

    for (const fielderId of input.fielderIds) {
      const existing = await tx.query.fieldingScorecard.findFirst({
        where: and(
          eq(fieldingScorecard.inningsId, inningsId),
          eq(fieldingScorecard.playerId, fielderId),
        ),
      });
      if (!existing) continue;

      if (input.wicketType === 'caught' || input.wicketType === 'caught_and_bowled') {
        await tx.update(fieldingScorecard).set({ catches: existing.catches + 1 })
          .where(eq(fieldingScorecard.id, existing.id));
      } else if (input.wicketType === 'run_out') {
        await tx.update(fieldingScorecard).set({ runOuts: existing.runOuts + 1 })
          .where(eq(fieldingScorecard.id, existing.id));
      } else if (input.wicketType === 'stumped') {
        await tx.update(fieldingScorecard).set({ stumpings: existing.stumpings + 1 })
          .where(eq(fieldingScorecard.id, existing.id));
      }
    }
  }

  private isBowlerWicket(wicketType?: string | null): boolean {
    if (!wicketType) return false;
    return ['bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'hit_wicket'].includes(wicketType);
  }

  /**
   * Update partnership tracking — context.md section 5.7
   * Active partnership gets runs/balls incremented.
   * On wicket, active partnership is ended and a new one begins.
   */
  private async updatePartnership(
    input: DeliveryInput, inningsId: string,
    totalRuns: number, isLegal: boolean, inningsScore: number, tx: TxOrDb = db,
  ) {
    // Find active partnership
    let active = await tx.query.partnership.findFirst({
      where: and(
        eq(partnership.inningsId, inningsId),
        eq(partnership.isActive, true),
      ),
    });

    // Create if none exists
    if (!active) {
      const [created] = await tx.insert(partnership).values({
        inningsId,
        batter1Id: input.strikerId,
        batter2Id: input.nonStrikerId,
        runs: 0,
        balls: 0,
        isActive: true,
        startedAtRuns: inningsScore - totalRuns,
      }).returning();
      active = created;
    }

    // Update runs and balls
    const ballsIncrement = input.extraType === 'wide' ? 0 : 1;
    await tx.update(partnership).set({
      runs: active.runs + totalRuns,
      balls: active.balls + ballsIncrement,
    }).where(eq(partnership.id, active.id));

    // On wicket, end this partnership
    if (input.isWicket) {
      await tx.update(partnership).set({
        isActive: false,
        endedAtRuns: inningsScore,
      }).where(eq(partnership.id, active.id));
    }
  }
}

export const scoringEngine = new ScoringEngine();
