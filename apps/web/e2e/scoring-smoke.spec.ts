import { test, expect, type Page } from '@playwright/test';

/** Stub API responses so smoke tests run without a live backend. */
async function mockPublicApi(page: Page) {
  await page.route('**/api/v1/matches**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/v1/users/feed**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], page: 1, limit: 20 }),
    });
  });
}

test.describe('scoring smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockPublicApi(page);
  });

  test('home page loads', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/CricScore/i);
    await expect(page.getByRole('heading', { name: 'CricScore' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
    await expect(page.getByRole('link', { name: /new match/i })).toBeVisible();
  });

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to matches/i })).toBeVisible();
  });

  test('navigates from home to create match flow', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /new match/i }).first().click();

    await expect(page).toHaveURL(/\/matches\/new/);
    await expect(page.getByRole('heading', { name: 'Create Match' })).toBeVisible();
  });
});
