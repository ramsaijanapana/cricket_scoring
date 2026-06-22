import { test, expect } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y';
import { mockPublicApi, MOCK_MATCH_ID } from './helpers/mock-api';

test.describe('accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockPublicApi(page);
  });

  test('home page has no critical or serious axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'CricScore' })).toBeVisible();
    await expectNoSeriousViolations(page, 'home');
  });

  test('login page has no critical or serious axe violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expectNoSeriousViolations(page, 'login');
  });

  test('scoring page has no critical or serious axe violations', async ({ page }) => {
    await page.goto(`/matches/${MOCK_MATCH_ID}/score`);
    await expect(page.getByRole('button', { name: 'Score 0 runs' })).toBeVisible();
    await expectNoSeriousViolations(page, 'scoring');
  });

  test('keyboard scorer flow records runs and opens wicket modal', async ({ page }) => {
    await page.goto(`/matches/${MOCK_MATCH_ID}/score`);
    await expect(page.getByRole('button', { name: 'Score 1 run' })).toBeVisible();
    await page.locator('#main-content').click();

    // Keyboard shortcuts: 0–6 score runs, W opens wicket modal
    await page.keyboard.press('2');
    await expect(page.getByRole('button', { name: 'Undo last delivery' })).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('w');
    await expect(page.getByRole('dialog', { name: 'Dismissal Type' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dismiss by bowled' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Dismissal Type' })).toBeHidden();
  });
});
