import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS } from '../viewports';
import { seedProfile, startDive } from '../../fixtures/delve';

for (const vp of PC_VIEWPORTS) {
  test(`Delve stop @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // The bot clears depth 1, and the stop between depths opens.
    await seedProfile(page);
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: 60_000 });
    await runProbes('delve-stop', vp, { delve: {} });
  });
}
