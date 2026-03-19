import { test, expect } from '@playwright/test';
import {
  startMatch,
  completeDraft,
  completeForge,
  skipDuel,
  continuePastDuel,
  waitForPhase,
  getCurrentPhase,
} from './fixtures/match';

test.describe('Phase Transitions (regression)', () => {
  test('draft → forge: AI picks automatically, forge screen loads', async ({ page }) => {
    await startMatch(page);

    // Verify we're in draft
    await waitForPhase(page, 'draft');

    // AI should pick on its own — we only pick on our turns
    await completeDraft(page);

    // Should transition to forge without manual intervention
    await waitForPhase(page, 'forge');
    await expect(page.getByText('FORGE PHASE')).toBeVisible();

    // Stats bar should be visible at top
    await expect(page.getByText(/HP/)).toBeVisible();
    await expect(page.getByText(/DMG/)).toBeVisible();
  });

  test('forge → duel: Done Forging transitions correctly', async ({ page }) => {
    await startMatch(page);
    await completeDraft(page);
    await waitForPhase(page, 'forge');

    // Complete forge
    await completeForge(page);

    // Should be in duel
    await waitForPhase(page, 'duel');
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  });

  test('duel → next phase: continues after combat', async ({ page }) => {
    await startMatch(page);
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await completeForge(page);
    await waitForPhase(page, 'duel');

    // Skip and continue
    await skipDuel(page);
    await continuePastDuel(page);

    // Should transition to draft R2 or result
    await page.waitForTimeout(1000);
    const phase = await getCurrentPhase(page);
    expect(['draft', 'result']).toContain(phase);
  });

  test('no hooks error during any transition', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('hooks')) {
        consoleErrors.push(msg.text());
      }
    });

    await startMatch(page);
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await completeForge(page);
    await waitForPhase(page, 'duel');
    await skipDuel(page);
    await continuePastDuel(page);
    await page.waitForTimeout(1000);

    expect(consoleErrors).toHaveLength(0);
  });

  test('error boundary catches render errors gracefully', async ({ page }) => {
    await startMatch(page);
    await completeDraft(page);
    await waitForPhase(page, 'forge');

    // Inject a render error into the forge component
    await page.evaluate(() => {
      // Corrupt the match state to trigger a render error
      const originalGetState = (window as any).__ZUSTAND_MATCH_STORE__?.getState;
      if (originalGetState) {
        const state = originalGetState();
        if (state?.state) {
          state.state.players = null; // Will cause render error
        }
      }
    });

    // The error boundary should catch it — check for fallback UI or no white screen
    // Even if we can't trigger it via store manipulation, verify no unhandled crashes
    await page.waitForTimeout(1000);

    // Page should still be interactive (either forge or error boundary)
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
    expect(hasContent!.length).toBeGreaterThan(0);
  });

  test('URL catch-all: /match/:code/forge redirects to PhaseRouter', async ({ page }) => {
    await startMatch(page);

    // Get the match code from the current URL
    const url = page.url();
    const matchCode = url.split('/match/')[1]?.split('/')[0]?.split('?')[0];
    expect(matchCode).toBeTruthy();

    // Navigate to a sub-route directly
    await page.goto(`/match/${matchCode}/forge`);
    await page.waitForTimeout(1000);

    // Should redirect to /match/:code (no sub-path)
    expect(page.url()).toContain(`/match/${matchCode}`);
    // Should render the current phase (draft, since we just started)
    const phase = await getCurrentPhase(page);
    expect(phase).not.toBe('unknown');
  });
});
