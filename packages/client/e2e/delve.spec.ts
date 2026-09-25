import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';

const SAVE_KEY = 'alloy:delve:v2';

/** Seed a deterministic fresh Delve save and let the engine bot play the arena. */
async function seedProfile(page: Page, seed = 4242, autopilot = true): Promise<void> {
  const save = JSON.stringify(createDelveProfile(createDefaultRegistry(), seed));
  await page.addInitScript(
    ([key, value, bot]) => {
      if (sessionStorage.getItem('delve-e2e')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      if (bot) localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:delve:timescale', '2');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('delve-e2e', '1');
    },
    [SAVE_KEY, save, autopilot] as const,
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
    await expect(page.locator('[data-testid="arena"] canvas')).toBeVisible();
    await expect(page.getByTestId('hero-hp')).toBeVisible();
    await expect(page.getByTestId('ability-0')).toHaveAttribute('aria-label', 'Primary: Fire Bolt');
    await expect(page.getByTestId('ability-1')).toHaveAttribute(
      'aria-label',
      'Defensive: Frost Ward',
    );
    await expect(page.getByTestId('ability-2')).toHaveAttribute(
      'aria-label',
      'Ultimate: Fire Nova',
    );
    await expect(page.getByTestId('mana-bar')).toBeVisible();
    await expect(page.getByTestId('dodge-button')).toBeVisible();

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

  test('D06: the ability bar fits on screen', async ({ page }) => {
    // No bot, so the fight (and the HUD) stays up while we measure.
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const bar = page.getByTestId('skill-bar');
    await expect(page.getByTestId('dodge-button')).toBeVisible();
    const box = (await bar.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });

  test('D05: basic attacks switch between auto and manual from the dive menu', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible();
    await page.getByRole('button', { name: 'Dive menu' }).click();
    const toggle = page.getByTestId('attack-mode-toggle');
    await expect(toggle).toContainText('Auto');
    await toggle.click();
    await expect(toggle).toContainText('Manual');
    if (test.info().project.name !== 'desktop') {
      await expect(page.getByTestId('attack-button')).toBeVisible();
    }
    await toggle.click();
    await expect(toggle).toContainText('Auto');
    await expect(page.getByTestId('attack-button')).toHaveCount(0);
  });

  test('D04: the anvil abilities, forge and codex tabs render', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await expect(page.getByTestId('mana-strip')).toContainText('Abilities');
    await page.getByTestId('mana-strip').click();
    await expect(page.getByTestId('abilities-panel')).toBeVisible();
    await page.getByTestId('form-burst').click();
    await page.getByTestId('infusion-nature').click();
    await expect(page.getByTestId('ability-readout')).toContainText('Wildfire Burst');
    await expect(page.getByTestId('abilities-summary')).toContainText('Wildfire Burst');
    await expect(page.getByTestId('reaction-unknown')).toHaveCount(7);
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('forge-panel')).toBeVisible();
    await expect(page.getByTestId('temper-row')).toHaveCount(2);
    await page.getByTestId('tab-codex').click();
    await expect(page.getByTestId('codex-unknown')).toHaveCount(12);
  });
});
