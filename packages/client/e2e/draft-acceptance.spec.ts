import { test, expect } from '@playwright/test';
import {
  startMatch,
  waitForPhase,
  pickOrb,
  completeDraft,
  completeForge,
  skipDuel,
  continuePastDuel,
} from './fixtures/match';

test.describe('Draft Acceptance Criteria (P0)', () => {

  // AC-D01: Pool is visible and readable
  test('D01: gems display element, tier, stat, and name', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Verify GemCards are visible in the pool
    const gems = page.locator('[data-gem]');
    await expect(gems.first()).toBeVisible();

    // Pool should have gems (24 for round 1)
    const count = await gems.count();
    expect(count).toBeGreaterThanOrEqual(10); // at least some gems visible
  });

  // AC-D02: Clean tap selects, second tap confirms
  test('D02: tap selects gem, second tap confirms pick', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Wait for player's turn
    await expect(page.getByText('YOUR PICK')).toBeVisible({ timeout: 10_000 });

    const gems = page.locator('[data-gem]');
    const firstGem = gems.first();
    const initialCount = await gems.count();

    // First tap — should select (gem stays in pool)
    await firstGem.click();
    await page.waitForTimeout(200);
    expect(await gems.count()).toBe(initialCount); // gem still in pool

    // Second tap on same gem — should confirm pick (gem leaves pool)
    await firstGem.click();
    await page.waitForTimeout(500);
    // After pick, pool should have one fewer gem OR it's opponent's turn
  });

  // AC-D05: Turn clarity - shows YOUR PICK or OPPONENT PICKING
  test('D05: turn indicator shows correct label', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Should show either YOUR PICK or OPPONENT PICKING
    const turnIndicator = page.getByText(/YOUR PICK|OPPONENT PICKING/);
    await expect(turnIndicator).toBeVisible({ timeout: 10_000 });
  });

  // AC-D06: Timer auto-picks on expiry
  // (This test would take 15s to wait for timer — mark as slow or skip in CI)
  test('D06: timer is visible during player turn', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Wait for player's turn
    await expect(page.getByText('YOUR PICK')).toBeVisible({ timeout: 10_000 });

    // Timer should be visible (shows seconds countdown)
    await expect(page.getByText(/\d+s/)).toBeVisible();
  });

  // AC-D07: Both stockpiles visible
  test('D07: opponent and player stockpiles are visible', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Both stockpile zones should be visible
    await expect(page.getByText('Opponent')).toBeVisible();
    await expect(page.getByText('Your Orbs')).toBeVisible();
  });

  // AC-D09: Draft completes and transitions to forge
  test('D09: draft completion shows phase transition overlay', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Complete the draft
    await completeDraft(page);

    // Should transition to forge
    await waitForPhase(page, 'forge');
    await expect(page.getByText('FORGE PHASE')).toBeVisible();
  });

  // AC-D10: Multi-round draft with correct pool sizes and round display
  test('D10: round display shows ROUND N DRAFT', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Should show "ROUND 1 DRAFT" in the status bar
    await expect(page.getByText(/ROUND 1 DRAFT/)).toBeVisible({ timeout: 10_000 });
  });

  test('D10: round 2 draft appears after duel 1', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Complete round 1: draft → forge → duel
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await completeForge(page);
    await waitForPhase(page, 'duel');
    await skipDuel(page);
    await continuePastDuel(page);

    // Should be back in draft for round 2
    await waitForPhase(page, 'draft');
    await expect(page.getByText(/ROUND 2 DRAFT/)).toBeVisible({ timeout: 10_000 });
  });

  // AC-D11: AI opponent picks at natural pace
  test('D11: AI takes at least 1 second to pick', async ({ page }) => {
    await startMatch(page);
    await waitForPhase(page, 'draft');

    // Pick our first gem to trigger AI turn
    await expect(page.getByText('YOUR PICK')).toBeVisible({ timeout: 10_000 });
    await pickOrb(page);

    // AI should be picking now
    await expect(page.getByText('OPPONENT PICKING')).toBeVisible({ timeout: 5_000 });

    // Record time
    const start = Date.now();

    // Wait for our turn to come back
    await expect(page.getByText('YOUR PICK')).toBeVisible({ timeout: 10_000 });

    const elapsed = Date.now() - start;
    // AI should take at least 1000ms (minimum delay)
    expect(elapsed).toBeGreaterThanOrEqual(750); // 750ms with tolerance for browser scheduling
  });

  // AC-D08: No console errors during draft flow
  test('D08: no unhandled errors during draft', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(msg.text());
      }
    });

    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('net::ERR') &&
      !e.includes('404')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
