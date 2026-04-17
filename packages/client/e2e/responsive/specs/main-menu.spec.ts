import { test, expect } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';

for (const vp of VIEWPORTS) {
  test(`MainMenu @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 10_000 });
    await runProbes('main-menu', vp);
  });
}
