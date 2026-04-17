import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase, completeDraft } from '../../fixtures/match';

for (const vp of VIEWPORTS) {
  test(`Forge equip @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await runProbes('forge-equip', vp);
  });
}
