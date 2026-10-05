import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';
import { openTraining } from './fixtures/delve';

/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;

/**
 * A fresh Delve save, no sandbox save (so the sandbox starts from its
 * defaults), and manual basic attacks (`MANUAL_ATTACK_KEY` in delveStore.ts),
 * so with nothing clicking the arena the Primary is the only damage.
 */
async function seed(page: Page): Promise<void> {
  const save = JSON.stringify(
    createDelveProfile(createDefaultRegistry(), 4242, { primary: 'fire' }),
  );
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('training-e2e')) return;
    localStorage.clear();
    localStorage.setItem('alloy:delve:v2', value);
    localStorage.setItem('alloy:delve:manualAttack', '1');
    localStorage.setItem('alloy:muted', 'true');
    sessionStorage.setItem('training-e2e', '1');
  }, save);
}

/** Open the Training dock (it opens on entry; with the mouse the fight runs on beside it). */
async function openPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('training-panel');
  if (!(await panel.isVisible())) await page.getByTestId('training-panel-toggle').click();
  await expect(panel).toBeVisible();
}

test.describe('Delve Training Grounds', () => {
  test('T01: add a dummy, switch the weapon, fire the Primary, and the meter counts it', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/delve');
    await openTraining(page);
    await expect(page.getByTestId('delve-training')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.locator('[data-testid="arena"] canvas')).toBeVisible({
      timeout: ARENA_READY,
    });
    const ability0 = page.getByTestId('ability-0');
    await expect(ability0).toBeVisible({ timeout: ARENA_READY });
    // The sandbox starts on Fire's default chains.
    await expect(ability0).toHaveAttribute('aria-label', 'Primary: light Fire Bolt');

    // The Training bar fits on one line: Anvil, the meter, then Panel and Menu.
    const bar = (await page.getByTestId('training-bar').boundingBox())!;
    const back = (await page.getByTestId('training-back').boundingBox())!;
    const chip = (await page.getByTestId('meter-chip').boundingBox())!;
    const toggle = (await page.getByTestId('training-panel-toggle').boundingBox())!;
    const menu = (await page.getByTestId('training-menu').boundingBox())!;
    expect(chip.x).toBeGreaterThanOrEqual(back.x + back.width);
    expect(chip.x + chip.width).toBeLessThanOrEqual(toggle.x);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(menu.x);
    expect(menu.x + menu.width).toBeLessThanOrEqual(bar.x + bar.width);
    // One row: they share the glass bar's middle line.
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    for (const b of [back, chip, toggle, menu])
      expect(Math.abs(mid(b) - mid(bar))).toBeLessThanOrEqual(2);

    await openPanel(page);
    await page.getByTestId('training-tab-targets').click();
    await page.getByTestId('add-dummy-single').click();
    await page.getByTestId('training-tab-loadout').click();
    await page.getByTestId('weapon-base-staff').click();
    await expect(page.getByTestId('weapon-name')).toContainText('Staff');

    const total = async () =>
      Number(await page.getByTestId('meter-total').getAttribute('data-total'));
    // The Primary auto-aims at the dummy. A slow frame can turn a click into a cancelled
    // aim, so press again until the meter counts a hit.
    await expect(async () => {
      await ability0.click();
      expect(await total()).toBeGreaterThan(0);
    }).toPass({ timeout: ARENA_READY });

    await openPanel(page);
    await page.getByTestId('training-tab-meter').click();
    await expect
      .poll(async () => Number(await page.getByTestId('meter-q').getAttribute('data-hits')), {
        timeout: ARENA_READY,
      })
      .toBeGreaterThan(0);
  });

  test('T02: socket any rune at any tier, free, and its pip shows on the button', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/delve');
    await openTraining(page);
    const ability0 = page.getByTestId('ability-0');
    await expect(ability0).toBeVisible({ timeout: ARENA_READY });
    // The HUD's pips carry their rune's id as `data-rune`.
    await expect(ability0.locator('[data-rune]')).toHaveCount(0);

    await openPanel(page);
    await page.getByTestId('training-tab-abilities').click();
    const cards = page.getByTestId('chain-cards');
    // No pouch and no price: every move takes up to 3 sockets, whatever the weapon.
    await cards.getByTestId('socket-open').click();
    await expect(cards.getByTestId('socket-open')).toBeVisible();
    await cards.getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker).toBeVisible();
    await picker.getByTestId('rune-tier-5').click();
    await picker.getByTestId('rune-pick-echo').click();
    await expect(picker).toBeHidden();
    await expect(cards.getByTestId('socket-0')).toHaveAttribute('data-rune', 'echo:5');
    const pips = ability0.locator('[data-rune]');
    await expect(pips).toHaveCount(1);
    await expect(pips).toHaveAttribute('data-rune', 'echo');
  });

  test('T03: Esc opens the menu over the paused fight, Esc resumes, and its Anvil entry leaves', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/delve/training');
    await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: ARENA_READY });
    const menu = page.getByTestId('system-menu');
    // The fight is live: the arena's menu key presses the bar's Menu.
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('menu-resume')).toBeFocused();
    // Paused, the menu's Back takes Esc; the dock stays as it was.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByTestId('training-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('menu-anvil').click();
    await expect(page).toHaveURL(/\/delve$/);
  });
});
