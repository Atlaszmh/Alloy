import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase } from '../../fixtures/match';

for (const vp of VIEWPORTS) {
  test(`Draft @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await runProbes('draft', vp);
  });
}
