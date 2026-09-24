import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';

const SAVE_KEY = 'alloy:delve:v1';

/** Seed a deterministic fresh Delve save (no auto-slam → fights replay identically). */
async function seedProfile(page: Page, seed = 4242): Promise<void> {
  const save = JSON.stringify(createDelveProfile(createDefaultRegistry(), seed));
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('delve-e2e')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      localStorage.setItem('alloy:delve:speed', '4');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('delve-e2e', '1');
    },
    [SAVE_KEY, save] as const,
  );
}

test.describe('Delve loot loop', () => {
  test('D01: menu → anvil → dive → clear depth → extract → back to the anvil', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/');
    await page.getByTestId('menu-delve').click();

    await expect(page.getByTestId('delve-camp')).toBeVisible();
    await expect(page.getByTestId('paper-doll')).toBeVisible();
    await expect(page.getByTestId('delve-howto')).toBeVisible();

    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible();
    await expect(page.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(page.getByTestId('monster-name')).toBeVisible();

    const door = page.getByTestId('door-choice');
    const summary = page.getByTestId('dive-summary');
    await expect(door.or(summary)).toBeVisible({ timeout: 60_000 });

    if (await door.isVisible()) {
      await expect(page.getByTestId('bounty')).not.toHaveText('⚙ 0');
      await page.getByTestId('extract-button').click();
      await expect(summary).toContainText('EXTRACTED');
    }

    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
    await expect(page.getByTestId('scrap-count')).not.toHaveText('⚙ 0 scrap');
    await expect(page.getByTestId('delve-howto')).toHaveCount(0);
  });

  test('D02: loot drops mid-dive and can be inspected and equipped', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    const loot = page.getByTestId('loot-item').first();
    await expect(loot).toBeVisible({ timeout: 60_000 });
    await loot.click();

    const sheet = page.getByTestId('item-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('item-name')).not.toBeEmpty();
    await expect(page.getByTestId('item-compare')).toBeVisible();
    await page.getByTestId('equip-button').click();
    await expect(sheet).toBeHidden();
  });

  test('D03: taking a door leads to the next depth', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: 60_000 });
    await door.locator('[data-testid^="door-"]').first().click();
    await expect(door).toBeHidden();
    await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');
  });

  test('D04: the anvil forge and codex tabs render', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('forge-panel')).toBeVisible();
    await expect(page.getByTestId('temper-row')).toHaveCount(2);
    await page.getByTestId('tab-codex').click();
    await expect(page.getByTestId('codex-unknown')).toHaveCount(12);
  });
});
