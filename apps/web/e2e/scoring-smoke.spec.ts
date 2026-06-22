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

  await page.route('**/api/v1/teams**', async (route) => {
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

  await page.route('**/api/v1/notifications/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0 }),
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
    await expect(page.getByRole('heading', { name: 'CricScore' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
    await expect(page.getByRole('link', { name: /new match/i })).toBeVisible();
  });

  test('home shows empty state when no matches', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('No matches yet')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /create match/i })).toBeVisible();
    await expect(page.getByText('Real-time cricket scoring')).toBeVisible();
  });

  test('layout shows footer and settings link', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Ball-by-ball cricket scoring')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveTitle(/Login.*CricScore/i);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to matches/i })).toBeVisible();
  });

  test('login validates empty form submission', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('alert')).toHaveText('Please enter email and password');
  });

  test('navigates back from login to home', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: /back to matches/i }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'CricScore' })).toBeVisible({ timeout: 15_000 });
  });

  test('navigates from home to create match flow', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /new match/i }).first().click();

    await expect(page).toHaveURL(/\/matches\/new/);
    await expect(page.getByRole('heading', { name: 'Create Match' })).toBeVisible();
  });

  test('create match page shows quick match and format wizard', async ({ page }) => {
    await page.goto('/matches/new');

    await expect(page.getByRole('heading', { name: 'Create Match' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Quick Match' })).toBeVisible();
    await expect(page.getByLabel('Quick match home team name')).toBeVisible();
    await expect(page.getByLabel('Quick match away team name')).toBeVisible();
    await expect(page.getByRole('button', { name: '20 overs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start scoring quick match' })).toBeVisible();

    await page.getByRole('button', { name: 'Set up a proper match with wizard' }).click();
    await expect(page.getByRole('heading', { name: 'Full Match Setup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Format: T20' })).toBeVisible();
    await expect(page.getByLabel('Step 1: Format (current)')).toBeVisible();
  });
});
