import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startRunViaStore, waitForPhase } from '../../fixtures/match';

// Uses startRunViaStore to land on forge with the BaseItemSelector already
// dismissed. Run mode vs ranked mode renders the same Forge layout so the
// responsive measurements are valid either way.
for (const vp of VIEWPORTS) {
  test(`Forge equip @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await waitForPhase(page, 'forge');
    await runProbes('forge-equip', vp);
  });
}
