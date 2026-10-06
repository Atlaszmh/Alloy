import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS, TEXT_VIEWPORTS, textSizeFor } from '../viewports';
import { ARENA_READY, seedProfile, startDive } from '../../fixtures/delve';

for (const vp of [...PC_VIEWPORTS, ...TEXT_VIEWPORTS]) {
  test(`Delve pause @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedProfile(page, 4242, false);
    await textSizeFor(page, vp);
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-screen')).toBeVisible();
    await runProbes('delve-pause', vp, { delve: {} });
    // Help over the pause.
    await page.getByTestId('pause-help').click();
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await runProbes('delve-pause-help', vp, { delve: {} });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-dialog')).toHaveCount(0);
    await page.getByTestId('pause-build').click();
    await expect(page.getByTestId('pause-hub')).toBeVisible();
    await runProbes('delve-pause-hub', vp, { delve: {} });
  });
}
