import { test, expect } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startRunViaStore, waitForPhase } from '../../fixtures/match';

// NOTE: the current Forge page renders the equip area and combine workbench on
// the same screen (no tab UI). This spec asserts the combine workbench is
// present, then scrolls it into view before running probes so the workbench
// region is the active focus for overflow / reachability checks.
//
// Uses startRunViaStore to land directly on the forge phase with the
// BaseItemSelector already dismissed (itemSelectionPhase: 'done'). Avoids the
// flaky draft→forge transition path; run mode vs ranked mode renders the same
// Forge layout so responsive measurements are valid either way.
//
// Portrait-tree spec — desktop aspect viewports render the HUD instead and
// are covered by forge-desktop-combine.spec.ts.
const PORTRAIT_VIEWPORTS = VIEWPORTS.filter(v => v.width / v.height < 1.5);

for (const vp of PORTRAIT_VIEWPORTS) {
  test(`Forge combine @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await waitForPhase(page, 'forge');

    // Confirm the combine workbench is part of the screen, then scroll it into view.
    // CombineWorkbench renders 3 data-combo-slot markers; use the KEEP slot as anchor.
    const workbench = page.locator('[data-combo-slot="0"]');
    await expect(workbench).toBeVisible({ timeout: 10_000 });
    await workbench.scrollIntoViewIfNeeded();

    await runProbes('forge-combine', vp);
  });
}
