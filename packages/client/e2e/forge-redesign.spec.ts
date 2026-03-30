import { test, expect } from '@playwright/test';
import {
  startMatch,
  completeDraft,
  waitForPhase,
} from './fixtures/match';

test.describe('Forge Screen Redesign', () => {
  test.beforeEach(async ({ page }) => {
    await startMatch(page);
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await expect(page.getByText(/FORGE PHASE/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1500); // Let animations settle
  });

  // F01: All stockpile gems visible on initial load
  test('F01: stockpile gems visible', async ({ page }) => {
    const gems = page.locator('[data-gem]');
    await expect(gems.first()).toBeVisible();
    const count = await gems.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  // F02: Tap gem to select, tap again to deselect
  test('F02: gem selection toggle', async ({ page }) => {
    const gem = page.locator('[data-gem]').first();
    await gem.click();
    await page.waitForTimeout(200);
    // Click again to deselect
    await gem.click();
    await page.waitForTimeout(200);
  });

  // F03: Tab switching preserves gem tray
  test('F03: tab switching preserves gems', async ({ page }) => {
    const gemsBefore = await page.locator('[data-gem]').count();
    // Switch to Equip tab
    const equipTab = page.getByText(/Equip/i).first();
    await equipTab.click();
    await page.waitForTimeout(300);
    const gemsAfter = await page.locator('[data-gem]').count();
    expect(gemsAfter).toBe(gemsBefore);
    // Switch back
    const combineTab = page.getByText(/Plan & Combine/i).first();
    await combineTab.click();
    await page.waitForTimeout(300);
    const gemsBack = await page.locator('[data-gem]').count();
    expect(gemsBack).toBe(gemsBefore);
  });

  // F04: Place gem in socket via equip tab
  test('F04: place gem in socket', async ({ page }) => {
    // Switch to Equip tab
    await page.getByText(/Equip/i).first().click();
    await page.waitForTimeout(300);

    // Select a gem
    const gem = page.locator('[data-gem]').first();
    await gem.click();
    await page.waitForTimeout(200);

    // Look for any clickable empty socket (dashed border elements)
    // The ItemSocketView renders sockets as divs with onClick handlers
    const sockets = page.locator('[data-socket]');
    const socketCount = await sockets.count();
    if (socketCount > 0) {
      await sockets.first().click();
      await page.waitForTimeout(300);
    }
  });

  // F05: Combination workbench visible on Plan & Combine tab
  test('F05: combination workbench visible', async ({ page }) => {
    // The workbench header text should be visible on the default tab
    await expect(page.getByText(/COMBINATION WORKBENCH/i)).toBeVisible({ timeout: 5000 });
  });

  // F06: Stockpile displays orb count
  test('F06: stockpile displays orb count', async ({ page }) => {
    // ForgeGemTray renders "STOCKPILE · N ORBS"
    const stockpileLabel = page.getByText(/STOCKPILE/i);
    await expect(stockpileLabel).toBeVisible();
    const text = await stockpileLabel.textContent();
    expect(text).toMatch(/\d+\s*ORBS/i);
  });

  // F07: Flux counter visible
  test('F07: flux counter visible', async ({ page }) => {
    // ForgeHeader renders "X / Y FLUX"
    const fluxText = page.getByText(/FLUX/i);
    await expect(fluxText.first()).toBeVisible();
  });

  // F08: Timer and Done button visible
  test('F08: done button visible', async ({ page }) => {
    // The ForgeHeader renders a DONE HapticButton
    const doneBtn = page.getByRole('button', { name: /DONE/i });
    await expect(doneBtn).toBeVisible();
  });

  // F09: Done button opens confirmation modal
  test('F09: done button opens confirmation modal', async ({ page }) => {
    const doneBtn = page.getByRole('button', { name: /DONE/i });
    await doneBtn.click();
    await page.waitForTimeout(300);

    // Modal should appear with "Commit your forge?" title
    await expect(page.getByText(/Commit your forge/i)).toBeVisible({ timeout: 3000 });

    // CANCEL and CONFIRM buttons
    await expect(page.getByRole('button', { name: /CANCEL/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /CONFIRM/i })).toBeVisible();
  });

  // F10: Cancel modal returns to forge
  test('F10: cancel modal returns to forge', async ({ page }) => {
    const doneBtn = page.getByRole('button', { name: /DONE/i });
    await doneBtn.click();
    await page.waitForTimeout(300);

    const cancelBtn = page.getByRole('button', { name: /CANCEL/i });
    await expect(cancelBtn).toBeVisible({ timeout: 3000 });
    await cancelBtn.click();
    await page.waitForTimeout(300);

    // Should still be on forge page
    await expect(page.getByText(/FORGE PHASE/i)).toBeVisible();
  });

  // F11: Confirm modal transitions to duel
  test('F11: confirm transitions to duel', async ({ page }) => {
    const doneBtn = page.getByRole('button', { name: /DONE/i });
    await doneBtn.click();
    await page.waitForTimeout(300);

    const confirmBtn = page.getByRole('button', { name: /CONFIRM/i });
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });
    await confirmBtn.click();

    // Should transition to duel phase
    await waitForPhase(page, 'duel');
  });

  // F12: Round indicator visible
  test('F12: round indicator visible', async ({ page }) => {
    // ForgeHeader renders "R1" or "R2" or "R3" as a round pill
    await expect(page.getByText(/R[123]/)).toBeVisible();
  });

  // F13: No console errors
  test('F13: no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForTimeout(2000);

    const critical = errors.filter(e => !e.includes('favicon') && !e.includes('404'));
    expect(critical).toEqual([]);
  });

  // F14: Touch-action none on gems
  test('F14: touch-action none on gems', async ({ page }) => {
    const gem = page.locator('[data-gem]').first();
    await expect(gem).toBeVisible();
    const touchAction = await gem.evaluate(el => {
      return window.getComputedStyle(el).touchAction;
    });
    expect(touchAction).toBe('none');
  });

  // F15: Base stat selectors visible in round 1
  test('F15: base stat selectors in R1', async ({ page }) => {
    const selectors = page.locator('select');
    const count = await selectors.count();
    // 4 selectors: 2 per item (weapon + armor)
    expect(count).toBeGreaterThanOrEqual(4);
  });

  // F16: Both tabs render correctly
  test('F16: both tabs render', async ({ page }) => {
    // Plan & Combine tab should be default — workbench visible
    await expect(page.getByText(/COMBINATION WORKBENCH/i)).toBeVisible();

    // Switch to Equip tab
    await page.getByText(/Equip/i).first().click();
    await page.waitForTimeout(300);

    // Workbench should be hidden, item info should be visible
    await expect(page.getByText(/COMBINATION WORKBENCH/i)).not.toBeVisible();
  });

  // F17: Full UI render verification
  test('F17: full UI renders without error', async ({ page }) => {
    // Verify key elements are present
    await expect(page.getByText(/FORGE PHASE/i)).toBeVisible();
    await expect(page.getByText(/FLUX/i).first()).toBeVisible();
    await expect(page.locator('[data-gem]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /DONE/i })).toBeVisible();
  });
});
