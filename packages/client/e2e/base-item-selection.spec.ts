/**
 * B01 / B02 — Base item selection flow
 *
 * B01: Round-1 run-mode forge shows weapon selector → click Confirm → armor
 *      selector → click Confirm → normal forge UI visible.
 * B02: Round-2 run-mode forge (hasSelectedBaseItems already true) does NOT
 *      show the selector; the forge tray is visible instead.
 *
 * Desktop-only — long integration flows that rely on frame-relative sizing.
 */

import { test, expect } from '@playwright/test';
import {
  startRun,
  completeDraft,
  waitForPhase,
  startRunViaStore,
} from './fixtures/match';

test.describe('Base Item Selection', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  });

  /**
   * B01: Full weapon → armor selection flow from a real run start.
   *
   * Navigates through the actual UI: Start Run → draft → forge (R1).
   * Clicks a specific item card (not Random) to exercise the Confirm button.
   */
  test('B01: round-1 forge shows weapon selector → armor selector → forge UI', async ({ page }) => {
    await startRun(page);
    await completeDraft(page);

    // --- Step 1: Weapon selector should appear ---
    await expect(page.getByText(/Choose your weapon/i)).toBeVisible({ timeout: 15_000 });

    // Pick any weapon card and click Confirm
    const weaponCard = page.locator('[data-base-item-card="true"]').first();
    await expect(weaponCard).toBeVisible({ timeout: 5_000 });
    await weaponCard.click();
    await page.waitForTimeout(200);

    // Confirm button should now be enabled; click it
    await page.getByRole('button', { name: /^Confirm$/i }).click();
    await page.waitForTimeout(300);

    // --- Step 2: Armor selector should appear ---
    await expect(page.getByText(/Choose your armor/i)).toBeVisible({ timeout: 5_000 });

    // Pick any armor card and click Confirm
    const armorCard = page.locator('[data-base-item-card="true"]').first();
    await expect(armorCard).toBeVisible({ timeout: 5_000 });
    await armorCard.click();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: /^Confirm$/i }).click();
    await page.waitForTimeout(300);

    // --- Step 3: Normal forge UI should now be visible ---
    await expect(page.getByText(/FORGE PHASE/i)).toBeVisible({ timeout: 5_000 });
    // The forge tray (stockpile) should be present
    await expect(page.locator('[data-screen-section="forge-tray"]')).toBeVisible({ timeout: 5_000 });

    // The selector headings should no longer be visible
    await expect(page.getByText(/Choose your weapon/i)).not.toBeVisible();
    await expect(page.getByText(/Choose your armor/i)).not.toBeVisible();
  });

  /**
   * B02: Round-2 forge does NOT show the selector.
   *
   * Uses startRunViaStore to fast-forward to round 2 forge.
   * The fixture marks hasSelectedBaseItems=true for the active matchId so the
   * selector is already dismissed, and the normal forge UI renders immediately.
   */
  test('B02: round-2 forge skips selector, shows normal forge UI', async ({ page }) => {
    await startRunViaStore(page, { round: 2, phase: 'forge' });
    await waitForPhase(page, 'forge');

    // Selector headings must NOT appear
    await expect(page.getByText(/Choose your weapon/i)).not.toBeVisible();
    await expect(page.getByText(/Choose your armor/i)).not.toBeVisible();

    // Normal forge UI should be present
    await expect(page.getByText(/FORGE PHASE/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-screen-section="forge-tray"]')).toBeVisible({ timeout: 5_000 });
  });
});
