import { test, expect } from '@playwright/test';
import { screenshotFlow, getViewport } from './fixtures/match';

test.describe('Meta Screens', () => {
  test('profile page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '01-profile');
  });

  test('gem library', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/gems');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '02-gem-library');

    // Click first gem card if available
    const firstGem = page.locator('[data-gem]').first();
    if (await firstGem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstGem.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'meta', '03-gem-library-inspect');
  });

  test('leaderboard page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/leaderboard');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '04-leaderboard');
  });

  test('settings page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await screenshotFlow(page, vp, 'meta', '05-settings');
  });
});
