import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase, completeDraft, completeForge } from '../../fixtures/match';

const TRANSITION_PROFILES = VIEWPORTS.filter((v) =>
  ['iphone-se', 'pixel-7', 'desktop-1280', 'qhd-1440p'].includes(v.name),
);

for (const vp of TRANSITION_PROFILES) {
  test(`Transition draft→forge @ ${vp.name}`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await runProbes('transition-draft-forge', vp);
  });

  test(`Transition forge→duel @ ${vp.name}`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await completeForge(page);
    await waitForPhase(page, 'duel');
    await runProbes('transition-forge-duel', vp, { overrides: { deadSpace: { minRatio: 0.65 } } });
  });
}
