import { db, type TxOrDb } from '../db/index';
import { commentary } from '../db/schema/index';
import { templates as enTemplates } from './commentary-templates/en';
import { templates as hiTemplates } from './commentary-templates/hi';
import type { CommentaryCategory, CommentaryTemplate } from './commentary-templates/en';

/**
 * Commentary Engine — context.md section 7.2
 *
 * Pipeline: Delivery Event -> Context Builder -> Template Selector -> NLG Engine
 *           -> Milestone Detector -> Commentary Record -> WebSocket Broadcast
 *
 * Supports multi-language templates via `language` parameter (default: 'en').
 */

const TEMPLATE_REGISTRY: Record<string, Record<CommentaryCategory, CommentaryTemplate[]>> = {
  en: enTemplates,
  hi: hiTemplates,
};

function getTemplates(language: string): Record<CommentaryCategory, CommentaryTemplate[]> {
  return TEMPLATE_REGISTRY[language] || TEMPLATE_REGISTRY['en'];
}

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
   * @param language - ISO 639-1 language code (default: 'en')
   */
  async generate(ctx: CommentaryContext, tx: TxOrDb = db, language: string = 'en') {
    // 1. Context Builder — enrich with match state
    const enrichedContext = this.buildContext(ctx);

    // 2. Template Selector — pick template category
    const category = this.selectCategory(ctx.delivery);

    // 3. NLG Engine — generate text using language-specific templates
    const { text, textShort, emojiText } = this.generateText(category, enrichedContext, language);

    // 4. Milestone Detector — check for milestones
    const milestone = this.detectMilestone(ctx);
    const dramaLevel = this.computeDramaLevel(category, milestone, ctx);

    // 5. Store commentary record
    const [record] = await tx.insert(commentary).values({
      deliveryId: ctx.delivery.id,
      matchId: ctx.matchId,
      inningsNum: ctx.inningsNum,
      overBall: ctx.overBall,
      text,
      textShort,
      emojiText,
      mode: 'auto',
      language,
      milestone,
      dramaLevel,
    }).returning();

    return record;
  }

  // --- Pipeline Stages ---

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
    language: string = 'en',
  ): { text: string; textShort: string; emojiText: string | null } {
    const langTemplates = getTemplates(language);
    const templates = langTemplates[category];
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
