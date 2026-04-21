import { test, expect } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startRunViaStore, waitForPhase } from '../../fixtures/match';

// Desktop HUD combine focus — same 5-viewport subset as forge-desktop-equip.
// ForgeDesktop renders the combine workbench inline in the middle column
// (CombineDock wraps CombineWorkbench). scrollIntoViewIfNeeded is a no-op
// on desktop since everything fits in the frame; kept defensive in case a
// viewport ever goes below the designed layout budget.
const DESKTOP_VIEWPORTS = VIEWPORTS.filter(
  (v) => v.width / v.height >= 1.5 && v.device !== 'mobile-landscape',
);

for (const vp of DESKTOP_VIEWPORTS) {
  test(`Forge desktop combine @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await waitForPhase(page, 'forge');

    const mode = await page.evaluate(() =>
      document.documentElement.getAttribute('data-frame-mode'),
    );
    if (mode !== 'desktop') {
      throw new Error(`expected desktop mode at ${vp.name}, got ${mode}`);
    }

    // Confirm the combine workbench mounted — CombineWorkbench renders 3
    // `data-combo-slot` markers; the KEEP slot (index 0) is the anchor.
    const workbench = page.locator('[data-combo-slot="0"]');
    await expect(workbench).toBeVisible({ timeout: 10_000 });
    await workbench.scrollIntoViewIfNeeded();

    await runProbes('forge-desktop-combine', vp);
  });
}
