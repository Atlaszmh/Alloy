import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startRunViaStore, waitForPhase } from '../../fixtures/match';

// Desktop HUD only — the new ForgeDesktop layout activates at
// (min-aspect-ratio: 3/2). Filter the shared VIEWPORTS matrix down to the
// landscape subset (aspect >= 1.5) so we exercise ForgeDesktop specifically
// rather than the portrait Forge layout also covered by forge-equip.spec.ts.
//
// Expected matrix: desktop-1280, fhd, 2k-dci, qhd-1440p, ultrawide (5 viewports).
// iphone-landscape (852×393) also satisfies aspect >= 1.5 but is mobile-landscape —
// the new desktop HUD is not designed for its 393px height, so we scope by device.
const DESKTOP_VIEWPORTS = VIEWPORTS.filter(
  (v) => v.width / v.height >= 1.5 && v.device !== 'mobile-landscape',
);

for (const vp of DESKTOP_VIEWPORTS) {
  test(`Forge desktop equip @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await waitForPhase(page, 'forge');

    // Assert the frame actually promoted to desktop mode. The app-frame
    // applies `data-frame-mode` based on aspect ratio; if it didn't land on
    // desktop something upstream has regressed the layout selection.
    const mode = await page.evaluate(() =>
      document.documentElement.getAttribute('data-frame-mode'),
    );
    if (mode !== 'desktop') {
      throw new Error(`expected desktop mode at ${vp.name}, got ${mode}`);
    }

    await runProbes('forge-desktop-equip', vp);
  });
}
