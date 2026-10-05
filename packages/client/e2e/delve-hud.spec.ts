import { test, expect } from '@playwright/test';
import { ARENA_READY, FLOOR_CLEAR, seedProfile, startDive } from './fixtures/delve';

// The lean HUD (the pad-first spec, 3): the default; the gain feed, the corner, Full by choice.
test.describe('Delve HUD', () => {
  test.describe.configure({ timeout: 240_000 });

  test('H01: lean by default: the corner and a gain feed that grows with the pickups; Settings → Full brings back the purse', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await startDive(page);
    const corner = page.getByTestId('lean-corner');
    await expect(corner).toBeVisible({ timeout: ARENA_READY });
    await expect(corner.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(corner.getByTestId('minimap')).toBeVisible();
    await expect(page.getByTestId('purse-bar')).toHaveCount(0);
    await expect(page.getByTestId('pickup-feed')).toHaveCount(0);
    // The bot picks things up: a count line top left ("+12 Scrap"), one line a kind.
    const feed = page.getByTestId('gain-feed');
    await expect(feed.getByTestId('feed-line').filter({ hasText: /^\+[\d,.]+k? / }).first()).toBeVisible({
      timeout: FLOOR_CLEAR,
    });
    const keys = await feed
      .getByTestId('feed-line')
      .evaluateAll((ls) => ls.map((l) => l.getAttribute('data-key')));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThanOrEqual(5);
    expect(await feed.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    // Settings → HUD → Full, from the pause list.
    await page.keyboard.press('Escape');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('hud-mode-full').click();
    await page.keyboard.press('Escape'); // Settings
    await page.keyboard.press('Escape'); // the list: Resume
    await expect(page.getByTestId('purse-bar')).toBeVisible();
    await expect(corner).toHaveCount(0);
  });
});
