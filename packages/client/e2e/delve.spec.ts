import { test, expect, type Page } from '@playwright/test';
import {
  bindSecondary,
  createDefaultRegistry,
  createDelveProfile,
  type ManaType,
} from '@alloy/engine';

const SAVE_KEY = 'alloy:delve:v2';
/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;

/** Seed a deterministic Delve save (a fire hero, and `secondary` bound if given) and let the engine bot play the arena. */
async function seedProfile(
  page: Page,
  seed = 4242,
  autopilot = true,
  secondary?: ManaType,
): Promise<void> {
  const registry = createDefaultRegistry();
  let profile = createDelveProfile(registry, seed, { primary: 'fire' });
  if (secondary) profile = bindSecondary(registry, profile, secondary).profile;
  const save = JSON.stringify(profile);
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
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(page.locator('[data-testid="arena"] canvas')).toBeVisible({
      timeout: ARENA_READY,
    });
    await expect(page.getByTestId('hero-hp')).toBeVisible();
    // Each button names its chain's next move: the bot is already stepping through the
    // Primary's (G04 and T01 see its first move before any press).
    await expect(page.getByTestId('ability-0')).toHaveAttribute(
      'aria-label',
      /^Primary: (light|medium|heavy) Fire Bolt$/,
    );
    await expect(page.getByTestId('ability-1')).toHaveAttribute(
      'aria-label',
      'Defensive: medium Fire Ward',
    );
    await expect(page.getByTestId('ability-2')).toHaveAttribute(
      'aria-label',
      'Ultimate: medium Fire Nova',
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
    await expect(page.getByTestId('monsters-left')).toContainText('foes');
  });

  test('D07: diving again at the same depth starts a fresh floor', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('extract-button').click();
    const summary = page.getByTestId('dive-summary');
    await expect(summary).toContainText('EXTRACTED');
    // No checkpoint yet, so "Dive again" starts at depth 1: the same key as the finished floor.
    await page.getByTestId('dive-again').click();
    await expect(summary).toBeHidden();
    await expect(page.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(page.getByTestId('monsters-left')).toContainText('foes', { timeout: ARENA_READY });
  });

  test('D06: the ability bar fits on screen', async ({ page }) => {
    // No bot, so the fight (and the HUD) stays up while we measure.
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const bar = page.getByTestId('skill-bar');
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    const box = (await bar.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });

  test('D05: basic attacks switch between auto and manual from the dive menu', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
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
    await seedProfile(page, 4242, true, 'nature');
    await page.goto('/delve');
    await expect(page.getByTestId('mana-strip')).toContainText('Abilities');
    await page.getByTestId('mana-strip').click();
    await expect(page.getByTestId('abilities-panel')).toBeVisible();
    // The Primary's first move becomes a Wildfire Burst; the chain keeps its other moves.
    await page.getByTestId('form-burst').click();
    await page.getByTestId('infusion-nature').click();
    await expect(page.getByTestId('ability-readout')).toContainText('light Wildfire Burst');
    await expect(page.getByTestId('abilities-summary')).toHaveText(
      'light Wildfire Burst · medium Fire Bolt · medium Fire Bolt · heavy Fire Bolt',
    );
    // A fifth move fills the cap: no more + card.
    await page.getByTestId('move-add').click();
    await expect(page.getByTestId('move-4')).toBeVisible();
    await expect(page.getByTestId('move-add')).toHaveCount(0);
    await expect(page.getByTestId('reaction-unknown')).toHaveCount(15);
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('forge-panel')).toBeVisible();
    await expect(page.getByTestId('temper-row')).toHaveCount(2);
    await page.getByTestId('tab-codex').click();
    await expect(page.getByTestId('codex-unknown')).toHaveCount(12);
  });

  test('D08: a new save chooses its mana first; Frost starts with frost gear and abilities', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('delve-e2e')) return;
      localStorage.clear();
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('delve-e2e', '1');
    });
    await page.goto('/delve');
    const choice = page.getByTestId('mana-choice');
    await expect(choice).toBeVisible();
    await page.getByTestId('mana-choice-frost').click();
    await expect(choice).toBeHidden();
    await page.getByTestId('tab-abilities').click();
    const summary = page.getByTestId('abilities-summary');
    await expect(summary).toContainText('Frost Bolt');
    await page.getByTestId('chain-skill-defensive').click();
    await expect(summary).toContainText('Frost Ward');
    await page.getByTestId('chain-skill-ultimate').click();
    await expect(summary).toContainText('Frost Nova');
    await page.getByTestId('slot-weapon').click();
    await expect(page.getByTestId('item-mana')).toContainText('Frost');
  });
});
