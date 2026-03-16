import { test, expect } from '@playwright/test';
import { screenshotFlow, getViewport } from './fixtures/match';

test.describe('Meta Screens', () => {
  test('profile page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '01-profile');
  });

  test('recipe book', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/recipes');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '02-recipe-book');

    // Apply fire filter if available
    const fireFilter = page.locator('button', { hasText: /^fire$/ });
    if (await fireFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fireFilter.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'meta', '03-recipe-filtered');
  });

  test('collection page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/collection');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '04-collection');

    // Expand first affix card if available
    const firstAffix = page.locator('[class*="cursor-pointer"]').first();
    if (await firstAffix.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstAffix.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'meta', '05-collection-expanded');
  });

  test('leaderboard page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/leaderboard');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '06-leaderboard');
  });

  test('settings page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '07-settings');
  });
});
