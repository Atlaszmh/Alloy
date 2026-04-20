import { test, expect } from '@playwright/test';
import {
  startMatch,
  completeDraft,
  waitForPhase,
} from './fixtures/match';

test.describe('Multiplayer Routing', () => {
  test('AI match generates ai- prefixed URL and loads draft', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Play vs AI' })).toBeVisible();

    // Click "Play vs AI" to go to tier selection
    await page.getByText('Play vs AI').click();
    await expect(page.getByText('Choose AI Tier')).toBeVisible();

    // Click any tier
    await page.getByText(/Tier 1/).first().click();

    // URL should be /match/ai-<hex> (no phase suffix — PhaseRouter uses a single URL)
    await expect(page).toHaveURL(/\/match\/ai-[a-z0-9]+$/, { timeout: 10_000 });

    // Draft phase should render (PhaseRouter switches phase components internally)
    await waitForPhase(page, 'draft');
  });

  // Removed: /match/:code/:phase deep-link paths no longer exist.
  // MatchRedirect silently strips sub-paths to /match/:code and PhaseRouter
  // handles any phase from that single URL. The "can't deep-link without state"
  // check no longer applies — navigating to /match/ai-fake123/draft redirects
  // to /match/ai-fake123 and PhaseRouter shows a loading spinner, not /queue.
  // test('direct navigation to /match/ai-xxx/draft without state redirects to /queue')

  test('PvP buttons hidden when offline', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Play vs AI' })).toBeVisible();

    // In offline mode (no VITE_SUPABASE_URL), PvP buttons should not appear
    await expect(page.getByText('Create Match')).not.toBeVisible();
    await expect(page.getByText('Find Match')).not.toBeVisible();

    // But "Play vs AI" should be visible
    await expect(page.getByText('Play vs AI')).toBeVisible();
  });

  test('full AI match flow starts correctly: menu → matchmaking → draft', async ({ page }) => {
    await startMatch(page);

    // Should be on the single match URL (no phase suffix)
    await expect(page).toHaveURL(/\/match\/ai-[a-z0-9]+$/);

    // Draft phase should be visible (PhaseRouter switches components internally)
    await waitForPhase(page, 'draft');

    // Pool should be visible (grid of gems)
    await expect(page.locator('[data-gem]').first()).toBeVisible({ timeout: 5000 });
  });

  // Removed: "match entry page redirects AI codes to draft"
  // The old test navigated to /match/:code (without /draft) and expected a redirect
  // to /match/:code/draft. That sub-path no longer exists — PhaseRouter serves all
  // phases from /match/:code directly, so there is no redirect to assert.
  // Additionally, the LocalGateway is in-memory: navigating away and back loses all
  // match state, making a "re-navigate and see draft" check impossible without a
  // persistent gateway. The essential intent (AI match lands on draft) is covered
  // by "full AI match flow starts correctly" above.

  test('navigating back from draft returns to queue', async ({ page }) => {
    await startMatch(page);
    // Confirm we are on the single match URL (PhaseRouter, no phase suffix)
    await expect(page).toHaveURL(/\/match\/ai-[a-z0-9]+$/);

    // Navigate back to queue
    await page.goto('/queue');
    await expect(page.getByRole('button', { name: 'Play vs AI' })).toBeVisible();
  });
});
