import { db } from '../db/index';
import { commentary } from '../db/schema/index';

/**
 * Commentary Engine — context.md section 7.2
 *
 * Pipeline: Delivery Event → Context Builder → Template Selector → NLG Engine
 *           → Milestone Detector → Commentary Record → WebSocket Broadcast
 */

interface CommentaryContext {
  delivery: any;
  matchId: string;
  inningsNum: number;
  overBall: string;
  inningsScore: number;
  inningsWickets: number;
  runRate: number;
}

export class CommentaryEngine {
  /**
   * Generate commentary for a delivery event.
   * Returns the created commentary record.
   */
  async generate(ctx: CommentaryContext) {
    // 1. Context Builder — enrich with match state
    const enrichedContext = this.buildContext(ctx);

    // 2. Template Selector — pick template category
    const category = this.selectCategory(ctx.delivery);

    // 3. NLG Engine — generate text
    const { text, textShort, emojiText } = this.generateText(category, enrichedContext);

    // 4. Milestone Detector — check for milestones
    const milestone = this.detectMilestone(ctx);
    const dramaLevel = this.computeDramaLevel(category, milestone, ctx);

    // 5. Store commentary record
    const [record] = await db.insert(commentary).values({
      deliveryId: ctx.delivery.id,
      matchId: ctx.matchId,
      inningsNum: ctx.inningsNum,
      overBall: ctx.overBall,
      text,
      textShort,
      emojiText,
      mode: 'auto',
      language: 'en',
      milestone,
      dramaLevel,
    }).returning();

    return record;
  }

  // ─── Pipeline Stages ─────────────────────────────────────────────────────

  private buildContext(ctx: CommentaryContext) {
    return {
      ...ctx,
      isChasing: ctx.delivery.inningsWickets !== undefined,
      requiredRate: 0, // would compute from target/overs remaining
    };
  }

  private selectCategory(delivery: any): CommentaryCategory {
    if (delivery.isWicket) return 'wicket';
    if (delivery.runsBatsman === 6) return 'six';
    if (delivery.runsBatsman === 4) return 'four';
    if (delivery.extraType === 'wide') return 'wide';
    if (delivery.extraType === 'noball') return 'noball';
    if (delivery.extraType === 'bye' || delivery.extraType === 'legbye') return 'extras';
    if (delivery.runsBatsman === 0) return 'dot';
    return 'runs';
  }

  private generateText(
    category: CommentaryCategory,
    ctx: any,
  ): { text: string; textShort: string; emojiText: string | null } {
    const templates = TEMPLATES[category];
    const template = templates[Math.floor(Math.random() * templates.length)];

    const text = this.interpolate(template.full, ctx);
    const textShort = this.interpolate(template.short, ctx);
    const emojiText = template.emoji ? this.interpolate(template.emoji, ctx) : null;

    return { text, textShort, emojiText };
  }

  private detectMilestone(ctx: CommentaryContext): string | null {
    const score = ctx.inningsScore;
    const wickets = ctx.inningsWickets;

    // Batting milestones (simplified — real impl would track per-batsman)
    if (score === 50 || score === 100 || score === 150 || score === 200) {
      return score <= 100 ? 'fifty' : 'hundred';
    }

    // Bowling milestones
    if (ctx.delivery.isWicket && wickets === 5) return 'five_wickets';

    return null;
  }

  private computeDramaLevel(
    category: CommentaryCategory,
    milestone: string | null,
    ctx: CommentaryContext,
  ): 1 | 2 | 3 {
    if (milestone) return 3;
    if (category === 'wicket') return 3;
    if (category === 'six') return 2;
    if (category === 'four') return 2;
    return 1;
  }

  private interpolate(template: string, ctx: any): string {
    return template
      .replace('{over_ball}', ctx.overBall || '?')
      .replace('{runs}', ctx.delivery?.runsBatsman?.toString() || '0')
      .replace('{total}', ctx.inningsScore?.toString() || '0')
      .replace('{wickets}', ctx.inningsWickets?.toString() || '0')
      .replace('{run_rate}', (ctx.runRate || 0).toFixed(2));
  }
}

type CommentaryCategory = 'dot' | 'runs' | 'four' | 'six' | 'wicket' | 'wide' | 'noball' | 'extras';

/**
 * Template bank — context.md section 7.2 categories.
 * Each template has full text, short ticker text, and optional emoji version.
 */
const TEMPLATES: Record<CommentaryCategory, Array<{ full: string; short: string; emoji?: string }>> = {
  dot: [
    { full: '{over_ball} — Dot ball. Well bowled, the batsman is beaten.', short: 'Dot ball', emoji: '⚫' },
    { full: '{over_ball} — Defended solidly back to the bowler.', short: 'Defended', emoji: '🛡️' },
    { full: '{over_ball} — No run. Good length delivery, left alone.', short: 'No run' },
  ],
  runs: [
    { full: '{over_ball} — {runs} run(s) taken. Score: {total}/{wickets}.', short: '{runs} run(s)', emoji: '🏃' },
    { full: '{over_ball} — Pushed into the gap for {runs}. {total}/{wickets}.', short: '{runs} runs' },
  ],
  four: [
    { full: '{over_ball} — FOUR! Brilliant shot races to the boundary. {total}/{wickets}.', short: 'FOUR!', emoji: '4️⃣🔥' },
    { full: '{over_ball} — FOUR! Cracked through the covers, no stopping that.', short: 'FOUR! Through covers', emoji: '4️⃣💥' },
    { full: '{over_ball} — FOUR! Driven elegantly past the fielder.', short: 'FOUR! Elegant drive', emoji: '4️⃣✨' },
  ],
  six: [
    { full: '{over_ball} — SIX! Massive hit, that has gone all the way! {total}/{wickets}.', short: 'SIX!', emoji: '6️⃣🚀' },
    { full: '{over_ball} — SIX! Into the stands! What a shot!', short: 'SIX! Into the stands', emoji: '6️⃣💫' },
    { full: '{over_ball} — SIX! Launched over long-on, enormous hit!', short: 'SIX! Over long-on', emoji: '6️⃣🏏' },
  ],
  wicket: [
    { full: '{over_ball} — OUT! Wicket falls! {total}/{wickets}.', short: 'OUT!', emoji: '❌🏏' },
    { full: '{over_ball} — WICKET! A crucial breakthrough! {total}/{wickets}.', short: 'WICKET! Breakthrough', emoji: '🎯❌' },
    { full: '{over_ball} — Gone! That is the end of the partnership. {total}/{wickets}.', short: 'WICKET! Partnership broken', emoji: '💔❌' },
  ],
  wide: [
    { full: '{over_ball} — Wide ball. Extra run conceded.', short: 'Wide', emoji: '↔️' },
    { full: '{over_ball} — Called wide. Straying down the leg side.', short: 'Wide ball' },
  ],
  noball: [
    { full: '{over_ball} — No ball! Overstepped the crease. Free hit coming up.', short: 'No ball! Free hit', emoji: '🚫🦶' },
    { full: '{over_ball} — No ball called. Front foot violation.', short: 'No ball' },
  ],
  extras: [
    { full: '{over_ball} — {runs} byes. Went past the keeper.', short: '{runs} byes', emoji: '👋' },
    { full: '{over_ball} — {runs} leg byes. Off the pads.', short: '{runs} leg byes' },
  ],
};
