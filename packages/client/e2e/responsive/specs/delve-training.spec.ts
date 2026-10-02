import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS } from '../viewports';
import { ARENA_READY, seedProfile } from '../../fixtures/delve';

for (const vp of PC_VIEWPORTS) {
  test(`Delve Training @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedProfile(page, 4242, false);
    await page.goto('/delve/training');
    await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: ARENA_READY });
    // The dock opens on entry: probe it beside the fight.
    await expect(page.getByTestId('training-panel')).toBeVisible();
    await runProbes('delve-training', vp, { delve: { arena: true } });
  });
}
