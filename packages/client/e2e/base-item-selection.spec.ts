/**
 * B01 / B02 — Base item selection flow
 *
 * B01: Round-1 run-mode forge shows a single loadout page with both weapon
 *      and armor rosters → pick one of each → click Confirm → normal forge UI.
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
   * B01: Single-page weapon + armor selection from a real run start.
   *
   * Navigates Start Run → draft → forge (R1). Clicks one card in each
   * section (not Random), then Confirm.
   */
  test('B01: round-1 forge shows combined loadout selector → forge UI', async ({ page }) => {
    await startRun(page);
    await completeDraft(page);

    // --- Combined loadout page should appear with both sections ---
    await expect(page.getByText(/Choose your loadout/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Choose your weapon/i)).toBeVisible();
    await expect(page.getByText(/Choose your armor/i)).toBeVisible();

    // Confirm is disabled until both are selected
    const confirm = page.getByRole('button', { name: /^Confirm$/i });
    await expect(confirm).toBeDisabled();

    // Pick a weapon
    const weaponCard = page
      .locator('[data-base-item-section="weapon"] [data-base-item-card="true"]')
      .first();
    await expect(weaponCard).toBeVisible({ timeout: 5_000 });
    await weaponCard.click();
    await expect(confirm).toBeDisabled();

    // Pick an armor — Confirm should now be enabled
    const armorCard = page
      .locator('[data-base-item-section="armor"] [data-base-item-card="true"]')
      .first();
    await expect(armorCard).toBeVisible({ timeout: 5_000 });
    await armorCard.click();
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await page.waitForTimeout(300);

    // --- Normal forge UI should now be visible ---
    await expect(page.getByText(/FORGE PHASE/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-screen-section="forge-tray"]')).toBeVisible({ timeout: 5_000 });

    // Selector headings should no longer be visible
    await expect(page.getByText(/Choose your loadout/i)).not.toBeVisible();
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

    // Selector heading must NOT appear
    await expect(page.getByText(/Choose your loadout/i)).not.toBeVisible();

    // Normal forge UI should be present
    await expect(page.getByText(/FORGE PHASE/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-screen-section="forge-tray"]')).toBeVisible({ timeout: 5_000 });
  });
});
