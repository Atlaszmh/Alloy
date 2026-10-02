import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';

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

/** Open the Training panel: docked (and open already) on desktop, a sheet on phones. */
async function openPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('training-panel');
  if (!(await panel.isVisible())) await page.getByTestId('training-panel-toggle').click();
  await expect(panel).toBeVisible();
}

/** Close a sheet so the fight runs again (a docked panel stays open). */
async function resume(page: Page): Promise<void> {
  const panel = page.getByTestId('training-panel');
  if ((await panel.getAttribute('data-layout')) === 'sheet')
    await page.getByTestId('training-panel-close').click();
  await expect(page.getByTestId('ability-0')).toBeVisible();
}

test.describe('Delve Training Grounds', () => {
  test('T01: add a dummy, switch the weapon, fire the Primary, and the meter counts it', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/delve');
    await page.getByTestId('training-button').click();
    await expect(page.getByTestId('delve-training')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.locator('[data-testid="arena"] canvas')).toBeVisible({
      timeout: ARENA_READY,
    });
    const ability0 = page.getByTestId('ability-0');
    await expect(ability0).toBeVisible({ timeout: ARENA_READY });
    // The sandbox starts on Fire's default chains.
    await expect(ability0).toHaveAttribute('aria-label', 'Primary: light Fire Bolt');

    // The top bar fits on one line: the meter sits between the two buttons.
    const back = (await page.getByTestId('training-back').boundingBox())!;
    const chip = (await page.getByTestId('meter-chip').boundingBox())!;
    const toggle = (await page.getByTestId('training-panel-toggle').boundingBox())!;
    expect(chip.x).toBeGreaterThanOrEqual(back.x + back.width);
    expect(chip.x + chip.width).toBeLessThanOrEqual(toggle.x);
    // One row: the three share the glass bar's middle line.
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(mid(chip) - mid(back))).toBeLessThanOrEqual(2);
    expect(Math.abs(mid(toggle) - mid(back))).toBeLessThanOrEqual(2);

    await openPanel(page);
    await page.getByTestId('training-tab-targets').click();
    await page.getByTestId('add-dummy-single').click();
    await page.getByTestId('training-tab-loadout').click();
    await page.getByTestId('weapon-base-staff').click();
    await expect(page.getByTestId('weapon-name')).toContainText('Staff');
    await resume(page);

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
    await page.getByTestId('training-button').click();
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
    await resume(page);
    const pips = ability0.locator('[data-rune]');
    await expect(pips).toHaveCount(1);
    await expect(pips).toHaveAttribute('data-rune', 'echo');
  });

  test('T03: Esc closes the Training sheet, and opens the panel again from the fight', async ({
    page,
  }) => {
    await seed(page);
    // Narrower than the dock's 1024 px: the panel opens as a sheet that pauses the fight.
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/delve/training');
    await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: ARENA_READY });
    const panel = page.getByTestId('training-panel');
    await page.getByTestId('training-panel-toggle').click();
    await expect(panel).toHaveAttribute('data-layout', 'sheet');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    // The fight is live again: the arena's menu key opens the panel.
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
  });
});
