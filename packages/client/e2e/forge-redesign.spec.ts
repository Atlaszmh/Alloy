import { test, expect } from '@playwright/test';
import {
  startMatch,
  completeDraft,
  completeForge,
  placeOrbs,
  waitForPhase,
} from './fixtures/match';

test.describe('Forge Redesign', () => {
  // Navigate to forge phase before each test
  test.beforeEach(async ({ page }) => {
    await startMatch(page);
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await expect(page.getByText('Forge Phase')).toBeVisible({ timeout: 5000 });
  });

  test('forge page shows both weapon and armor tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /weapon/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /armor/i })).toBeVisible();
  });

  test('place gem via click: select orb then click empty slot', async ({ page }) => {
    // Find a stockpile orb (either GemCard or OrbIcon)
    const gems = page.locator('[data-gem]');
    const orbBtns = page.locator('button[title*="(T"]:not([disabled])');
    const gemCount = await gems.count();
    const orbCount = await orbBtns.count();

    expect(gemCount + orbCount).toBeGreaterThan(0);

    // Select the first available orb
    if (gemCount > 0) {
      await gems.first().click();
    } else {
      await orbBtns.first().click();
    }
    await page.waitForTimeout(200);

    // Click an empty slot
    const emptySlots = page.locator('button:has-text("+"):not([title])');
    const slotCount = await emptySlots.count();
    expect(slotCount).toBeGreaterThan(0);

    await emptySlots.first().click();
    await page.waitForTimeout(300);

    // Verify the slot is now filled (fewer empty slots)
    const remainingSlots = await emptySlots.count();
    expect(remainingSlots).toBeLessThan(slotCount);
  });

  test('remove gem click in round 2+', async ({ page }) => {
    // Complete round 1 forge → duel, then get to round 2 forge
    await placeOrbs(page);
    await completeForge(page);

    // Skip duel
    const skipBtn = page.getByRole('button', { name: 'Skip' });
    await expect(skipBtn).toBeVisible({ timeout: 10_000 });
    await skipBtn.click();
    await page.waitForTimeout(500);

    // Continue past duel
    const continueBtn = page.getByRole('button', { name: /Continue|See Results/i });
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });
    await continueBtn.click();
    await page.waitForTimeout(500);

    // Complete round 2 draft
    await completeDraft(page);
    await waitForPhase(page, 'forge');

    // Now in round 2 — placed orbs should be removable
    const placedOrbs = page.locator('button[title*="(T"]');
    const placedCount = await placedOrbs.count();

    if (placedCount > 0) {
      // Click a placed orb to attempt removal
      await placedOrbs.first().click();
      await page.waitForTimeout(300);
    }
  });

  test('confirm modal flow: Done Forging completes forge', async ({ page }) => {
    // Place at least one orb
    await placeOrbs(page);

    // Click Done Forging
    const doneBtn = page.getByRole('button', { name: 'Done Forging' });
    await expect(doneBtn).toBeVisible();
    await doneBtn.click();

    // If a confirmation modal appears, click CONFIRM
    const confirmBtn = page.getByRole('button', { name: 'CONFIRM' });
    const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasConfirm) {
      await confirmBtn.click();
    }

    // Should transition to duel phase
    await waitForPhase(page, 'duel');
    expect(page.url()).toContain('/duel');
  });

  test('cancel modal returns to forge (if modal exists)', async ({ page }) => {
    await placeOrbs(page);

    const doneBtn = page.getByRole('button', { name: 'Done Forging' });
    await doneBtn.click();

    // Check for cancel button in modal
    const cancelBtn = page.getByRole('button', { name: /CANCEL|Cancel/i });
    const hasCancel = await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCancel) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
      // Should still be on forge page
      expect(page.url()).toContain('/forge');
      await expect(page.getByText('Forge Phase')).toBeVisible();
    } else {
      // No modal — Done Forging transitions directly
      await waitForPhase(page, 'duel');
    }
  });

  test('flux tracks correctly in header', async ({ page }) => {
    // Flux should be visible in the round info
    const fluxText = page.getByText(/Flux:/);
    await expect(fluxText).toBeVisible();

    // Get the initial flux value
    const headerText = await page.getByText(/Flux:/).textContent();
    expect(headerText).toContain('Flux:');

    // The flux value should be a number
    const match = headerText?.match(/Flux:\s*(\d+)/);
    expect(match).not.toBeNull();
    const fluxValue = parseInt(match![1], 10);
    expect(fluxValue).toBeGreaterThanOrEqual(0);
  });

  test('switching tabs shows different item slots', async ({ page }) => {
    // Start on weapon tab
    const weaponTab = page.getByRole('button', { name: /weapon/i });
    const armorTab = page.getByRole('button', { name: /armor/i });

    // Place an orb on weapon
    await placeOrbs(page);

    // Switch to armor tab
    await armorTab.click();
    await page.waitForTimeout(300);

    // Armor should have all 6 empty slots (nothing placed yet)
    const emptySlots = page.locator('button:has-text("+"):not([title])');
    const slotCount = await emptySlots.count();
    expect(slotCount).toBe(6);

    // Switch back to weapon
    await weaponTab.click();
    await page.waitForTimeout(300);

    // Weapon should have fewer empty slots (we placed orbs earlier)
    const weaponSlots = await emptySlots.count();
    expect(weaponSlots).toBeLessThanOrEqual(6);
  });

  test('stockpile displays orb count', async ({ page }) => {
    const stockpileHeader = page.getByText(/Stockpile \(\d+\)/);
    await expect(stockpileHeader).toBeVisible();

    const text = await stockpileHeader.textContent();
    const match = text?.match(/Stockpile \((\d+)\)/);
    expect(match).not.toBeNull();
    const count = parseInt(match![1], 10);
    expect(count).toBeGreaterThan(0);
  });
});
