import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

/**
 * Run axe on the current page and fail when critical/serious violations exist.
 */
export async function expectNoSeriousViolations(page: Page, context?: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));

  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`)
      .join('\n\n');
    expect(blocking, context ? `a11y violations on ${context}:\n${summary}` : summary).toEqual([]);
  }
}
