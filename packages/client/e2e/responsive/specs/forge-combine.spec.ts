import { test, expect } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase, completeDraft } from '../../fixtures/match';

// NOTE: the current Forge page renders the equip area and combine workbench on
// the same screen (no tab UI). This spec asserts the combine workbench is
// present, then scrolls it into view before running probes so the workbench
// region is the active focus for overflow / reachability checks.
for (const vp of VIEWPORTS) {
  test(`Forge combine @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');

    // Confirm the combine workbench is part of the screen, then scroll it into view.
    const workbench = page.getByText(/COMBINATION WORKBENCH/i);
    await expect(workbench).toBeVisible({ timeout: 10_000 });
    await workbench.scrollIntoViewIfNeeded();

    await runProbes('forge-combine', vp);
  });
}
