import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS, TEXT_VIEWPORTS, textSizeFor } from '../viewports';
import { FLOOR_CLEAR, seedProfile, startDive, toRoad } from '../../fixtures/delve';

for (const vp of [...PC_VIEWPORTS, ...TEXT_VIEWPORTS]) {
  test(`Delve stop @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    // The bot clears depth 1 at every size: about 2× the slowest, 3440×1440's 103 s (40–81 s
    // the rest, one or two workers), on the Linux software renderer.
    test.setTimeout(210_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // The bot clears depth 1, and the stop between depths opens.
    await seedProfile(page);
    await textSizeFor(page, vp);
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: FLOOR_CLEAR });
    await expect(page.getByTestId('stop-boon')).toBeVisible(); // step 1: the boon cards, probed before toRoad
    await runProbes('delve-stop', vp, { delve: {} });
    await toRoad(page);
    await runProbes('delve-stop-road', vp, { delve: {} });
  });
}
