import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS } from '../viewports';
import { ARENA_READY, seedProfile } from '../../fixtures/delve';

for (const vp of PC_VIEWPORTS) {
  test(`Delve dive @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // No bot, so the fight (and the HUD) stays up while the probes measure.
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await runProbes('delve-dive', vp, { delve: { arena: true } });
  });
}
