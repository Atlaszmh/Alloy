import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startRunViaStore, waitForPhase } from '../../fixtures/match';

// Uses startRunViaStore to land directly on the duel phase, bypassing the
// flaky draft→forge→duel transition chain. Responsive checks don't care which
// match mode we used to arrive at the duel — the layout is the same.
for (const vp of VIEWPORTS) {
  test(`Duel @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startRunViaStore(page, { round: 1, phase: 'duel' });
    await waitForPhase(page, 'duel');
    await runProbes('duel', vp, { overrides: { deadSpace: { minRatio: 0.65 } } });
  });
}
