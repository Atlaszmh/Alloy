import { test, expect } from '@playwright/test';
import {
  startMatch,
  waitForPhase,
  completeDraft,
  completeForge,
  skipDuel,
  continuePastDuel,
} from './fixtures/match';

test.describe('Duel Acceptance Criteria', () => {
  // Helper: navigate to duel phase
  async function reachDuel(page: import('@playwright/test').Page) {
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await completeForge(page);
    await waitForPhase(page, 'duel');
  }

  // DU01: Canvas renders during duel
  test('DU01: canvas renders during duel', async ({ page }) => {
    await reachDuel(page);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  });

  // DU02: Skip button is visible
  test('DU02: skip button is visible', async ({ page }) => {
    await reachDuel(page);
    await expect(page.getByRole('button', { name: /skip/i })).toBeVisible({ timeout: 15000 });
  });

  // DU03: Skip advances past duel to results
  test('DU03: skip advances past duel', async ({ page }) => {
    await reachDuel(page);
    await skipDuel(page);
    await expect(page.getByText(/continue|see results/i)).toBeVisible({ timeout: 15000 });
  });

  // DU04: No console errors during duel playback
  test('DU04: no console errors during duel', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await reachDuel(page);
    await skipDuel(page);
    await expect(page.getByText(/continue|see results/i)).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);
  });
});
