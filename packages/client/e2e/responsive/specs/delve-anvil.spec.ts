import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS } from '../viewports';
import { seedProfile } from '../../fixtures/delve';

const TABS = ['loadout', 'skills', 'forge', 'codex', 'quests'] as const;

for (const vp of PC_VIEWPORTS) {
  for (const tab of TABS) {
    test(`Delve Anvil ${tab} @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedProfile(page, 4242, false);
      await page.goto('/delve');
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      await runProbes(`delve-anvil-${tab}`, vp, { delve: {} });
    });
  }
}
