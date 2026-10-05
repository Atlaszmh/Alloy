import { test, expect } from '../fixtures/responsive-fixture';
import { PC_VIEWPORTS } from '../viewports';
import { armed, seedProfile, stepTo } from '../../fixtures/delve';
import {
  applyQuestEvents,
  claimQuest,
  createDefaultRegistry,
  createDelveProfile,
  generateItem,
  SeededRNG,
  type Rarity,
} from '@alloy/engine';

// The fixture's save (seed 4242, fire) with First Steps done, claimed or not.
const registry = createDefaultRegistry();
const firstStepsDone = applyQuestEvents(
  registry,
  createDelveProfile(registry, 4242, { primary: 'fire' }),
  [{ type: 'reachDepth', depth: 2 }],
);
const QUESTS = {
  claim: firstStepsDone.quests,
  done: claimQuest(registry, firstStepsDone, 'first_steps').profile.quests,
};

// Two common helms under a worn epic one: Salvage junk's sheet has rows to review.
const helm = (rarity: Rarity, i: number) =>
  generateItem(registry, { uid: `junk-${i}`, ilvl: 4, rarity, slot: 'helm', mana: 'fire' }, new SeededRNG(300 + i));
const JUNK = {
  equipped: {
    ...armed(registry, createDelveProfile(registry, 4242, { primary: 'fire' })).equipped,
    helm: helm('epic', 0),
  },
  bag: [helm('common', 1), helm('common', 2)],
};

const TABS = ['loadout', 'skills', 'forge', 'codex', 'quests'] as const;

for (const vp of PC_VIEWPORTS) {
  for (const tab of TABS) {
    test(`Delve Anvil ${tab} @ ${vp.name} (${vp.width}×${vp.height})`, async ({
      page,
      runProbes,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedProfile(page, 4242, false);
      await page.goto('/delve');
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      await runProbes(`delve-anvil-${tab}`, vp, { delve: {} });
    });
  }

  // The Forge tab's benches with the most in them: a forge's preview, Temper and Materials.
  for (const bench of ['forge-preview', 'temper', 'materials'] as const) {
    test(`Delve Anvil ${bench} @ ${vp.name} (${vp.width}×${vp.height})`, async ({
      page,
      runProbes,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedProfile(page, 4242, false);
      await page.goto('/delve');
      await page.getByTestId('tab-forge').click();
      if (bench === 'temper') {
        await page.getByTestId('bench-temper').click();
        await expect(page.getByTestId('temper')).toBeVisible();
      } else if (bench === 'materials') {
        await page.getByTestId('bench-materials').click();
        await expect(page.getByTestId('materials-pane')).toBeVisible();
      } else {
        await page.getByTestId('pattern-cuirass').click();
        await stepTo(page, 'forge-flux', /^Uncommon/);
        await expect(page.getByTestId('forge-title')).toHaveText('Uncommon Cuirass');
      }
      await runProbes(`delve-anvil-${bench}`, vp, { delve: {} });
    });
  }

  // Help over the system menu: its longest topic scrolls inside its body.
  test(`Delve Anvil help @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await expect(page.getByTestId('depart-button')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('open-help').click();
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await runProbes('delve-anvil-help', vp, { delve: {} });
  });

  // Salvage junk's review sheet.
  test(`Delve Anvil junk @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedProfile(page, 4242, false, undefined, JUNK);
    await page.goto('/delve');
    await page.getByTestId('salvage-junk').click();
    await expect(page.getByTestId('junk-row')).toHaveCount(2);
    await runProbes('delve-anvil-junk', vp, { delve: {} });
  });

  // The Quests tab's fuller states: a contract open on the board (Reroll), a quest to claim, and
  // the Done group open on a claimed one.
  for (const state of ['contract', 'claim', 'done'] as const) {
    test(`Delve Anvil quests-${state} @ ${vp.name} (${vp.width}×${vp.height})`, async ({
      page,
      runProbes,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const over = state === 'contract' ? {} : { quests: QUESTS[state] };
      await seedProfile(page, 4242, false, undefined, over);
      await page.goto('/delve');
      await page.getByTestId('tab-quests').click();
      if (state === 'contract') {
        await page.getByTestId('contract-slot-0').getByRole('button').click();
        await expect(page.getByTestId('quest-reroll')).toBeVisible();
      } else if (state === 'claim') {
        await expect(page.getByTestId('quest-claim')).toBeVisible();
      } else {
        await page.getByTestId('quest-done-toggle').click();
        await page.getByTestId('quest-first_steps').click();
        await expect(page.getByTestId('quest-detail')).toContainText('Claimed');
      }
      await runProbes(`delve-anvil-quests-${state}`, vp, { delve: {} });
    });
  }
}
