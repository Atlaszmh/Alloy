import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS } from '../viewports';

for (const vp of PC_VIEWPORTS) {
  test(`Title screen @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await expect(page.getByTestId('menu-delve')).toBeVisible({ timeout: 10_000 });
    await runProbes('title-screen', vp, { delve: {} });
  });
}
