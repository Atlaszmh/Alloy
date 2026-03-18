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
    await expect(page.getByText('Choose Opponent')).toBeVisible();

    // Click "Play vs AI" to go to tier selection
    await page.getByText('Play vs AI').click();
    await expect(page.getByText('Choose AI Tier')).toBeVisible();

    // Click any tier
    await page.getByText(/Tier 1/).first().click();

    // URL should have ai- prefix
    await expect(page).toHaveURL(/\/match\/ai-[a-z0-9]+\/draft/);

    // Draft page should load (heading should appear)
    await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible({ timeout: 10_000 });
  });

  test('direct navigation to /match/ai-xxx/draft without state redirects to /queue', async ({ page }) => {
    // Navigate directly to a draft URL without having started a match
    await page.goto('/match/ai-fake123/draft');

    // Should redirect to queue since there's no match state
    await expect(page).toHaveURL(/\/queue/, { timeout: 10_000 });
  });

  test('PvP buttons hidden when offline', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByText('Choose Opponent')).toBeVisible();

    // In offline mode (no VITE_SUPABASE_URL), PvP buttons should not appear
    await expect(page.getByText('Create Match')).not.toBeVisible();
    await expect(page.getByText('Find Match')).not.toBeVisible();

    // But "Play vs AI" should be visible
    await expect(page.getByText('Play vs AI')).toBeVisible();
  });

  test('full AI match flow starts correctly: menu → matchmaking → draft', async ({ page }) => {
    await startMatch(page);

    // Should be on draft page
    await expect(page).toHaveURL(/\/match\/ai-.*\/draft/);

    // Wait for draft UI to render (opponent heading should be visible)
    await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible({ timeout: 10_000 });

    // Pool should be visible (grid of orbs)
    await expect(page.locator('[data-gem]').first()).toBeVisible({ timeout: 5000 });
  });

  test('match entry page redirects AI codes to draft', async ({ page }) => {
    // Start a real match first so state exists
    await startMatch(page);
    const draftUrl = page.url();

    // Extract the match code from the URL
    const match = draftUrl.match(/\/match\/(ai-[a-z0-9]+)\/draft/);
    expect(match).toBeTruthy();
    const code = match![1];

    // Navigate to the match entry URL (without /draft)
    await page.goto(`/match/${code}`);

    // Should redirect to draft
    await expect(page).toHaveURL(new RegExp(`/match/${code}/draft`), { timeout: 10_000 });
  });

  test('navigating back from draft returns to queue', async ({ page }) => {
    await startMatch(page);
    await expect(page).toHaveURL(/\/match\/ai-.*\/draft/);

    // Navigate back to queue
    await page.goto('/queue');
    await expect(page.getByText('Choose Opponent')).toBeVisible();
  });
});
