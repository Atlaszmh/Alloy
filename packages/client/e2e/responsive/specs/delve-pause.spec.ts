import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS } from '../viewports';
import { ARENA_READY, seedProfile, startDive } from '../../fixtures/delve';

for (const vp of PC_VIEWPORTS) {
  test(`Delve pause @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-screen')).toBeVisible();
    await runProbes('delve-pause', vp, { delve: {} });
    await page.getByTestId('pause-build').click();
    await expect(page.getByTestId('pause-hub')).toBeVisible();
    await runProbes('delve-pause-hub', vp, { delve: {} });
  });
}
