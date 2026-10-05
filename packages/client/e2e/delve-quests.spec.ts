import { test, expect, type Page } from '@playwright/test';
import {
  claimQuest,
  createDefaultRegistry,
  economySim,
  questStates,
  type DelveProfile,
} from '@alloy/engine';
import { ARENA_READY, FLOOR_CLEAR, SAVE_KEY, seedProfile, startDive } from './fixtures/delve';
import { BUTTON, installPad, tap } from './fixtures/pad';

// Quests (see the quests spec): the main line's first quest done in a dive and claimed at the
// Anvil, a contract rerolled once a visit, and the pad claiming where the focus lands (the
// pad-first UI spec, 2.3).

/** Store `profile` as the save (muted), with a fake pad to press. */
async function seedSave(page: Page, profile: DelveProfile): Promise<void> {
  await installPad(page);
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('delve-e2e')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('delve-e2e', '1');
    },
    [SAVE_KEY, JSON.stringify(profile)] as const,
  );
}

/** RB from the Anvil's Loadout to Quests: the focus lands on the tab's first control. */
async function padToQuests(page: Page): Promise<void> {
  await page.goto('/delve');
  await expect(page.getByTestId('depart-button')).toBeVisible();
  for (let i = 0; i < 4; i++) await tap(page, BUTTON.rb);
  await expect(page.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
}
test.describe('Delve quests', () => {
  // A floor's clear may take most of the default two minutes under load.
  test.describe.configure({ timeout: 240_000 });
  test('Q01: First Steps done in a dive, claimed at the Anvil, and the next main quest opens', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    // A new save tracks First Steps: the HUD shows its progress at depth 1.
    const tracked = page.getByTestId('quest-tracker').getByTestId('tracked-first_steps');
    await expect(tracked).toContainText('First Steps');
    await expect(tracked).toContainText('Reach depth 2');
    await expect(tracked).toContainText('1 / 2');

    // A door down enters depth 2 (First Steps done the moment it happens, with its toast), then
    // abandon: progress counts, death or not.
    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: FLOOR_CLEAR });
    // The toast lasts 2 s: watch for it from before the click, so a slow run can't miss it.
    const toast = page
      .getByText('Quest complete: First Steps · claim at the Anvil')
      .waitFor({ timeout: 15_000 });
    await door.getByTestId('door-list').locator('[data-door]').first().click();
    await toast;
    await expect(door).toBeHidden();
    await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');
    // Done, Bring It Home unlocks at once and takes its tracker slot (First Steps waits to be claimed).
    await expect(tracked).toHaveCount(0);
    await expect(
      page.getByTestId('quest-tracker').getByTestId('tracked-bring_it_home'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('dive-pause').getByTestId('pause-abandon').click();
    await expect(page.getByTestId('dive-summary')).toContainText('ABANDONED');
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();

    // The Anvil: the tab's pip and the Depart sheet's count (a contract may be done too); the
    // count closes the sheet and opens Quests.
    await expect(page.getByTestId('claim-pip')).toHaveText(/^[1-9][0-9]*$/);
    await page.getByTestId('depart-button').click();
    await page.getByTestId('claim-count').click();
    await expect(page.getByTestId('depart-sheet')).toHaveCount(0);
    await expect(page.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
    const first = page.getByTestId('quest-journal').getByTestId('quest-first_steps');
    await expect(first.getByTestId('quest-done')).toHaveText('DONE');
    await first.click();
    await page.getByTestId('quest-claim').click();
    await expect(page.getByTestId('quest-message')).toContainText('Claimed First Steps');

    // Claimed: First Steps moves to Done (open while it stays the open quest; collapsed when a
    // contract that was done opened next), and the next main quest (unlocked as First Steps was
    // done) is still NEW.
    const doneToggle = page.getByTestId('quest-done-toggle');
    await expect(doneToggle).toHaveText(/Done · 1/);
    if ((await doneToggle.getAttribute('aria-expanded')) === 'false') await doneToggle.click();
    await expect(page.getByTestId('quest-group-done')).toContainText('First Steps');
    const next = page.getByTestId('quest-group-main').getByTestId('quest-bring_it_home');
    await expect(next.getByTestId('quest-new')).toBeVisible();
  });

  test('Q03: on the pad, Quests lands on Claim all, and A claims every quest that waits', async ({
    page,
  }) => {
    // Three dives of the autopilot leave quests waiting (seed 1: two main and a side quest).
    const registry = createDefaultRegistry();
    const profile = economySim(registry, 1, 3).profile;
    const waiting = questStates(registry, profile).filter((q) => q.status === 'complete');
    expect(waiting.length).toBeGreaterThanOrEqual(2);
    await seedSave(page, profile);
    await padToQuests(page);
    const all = page.getByTestId('quest-claim-all');
    await expect(all).toHaveText(`Claim all ${waiting.length}`);
    await expect(all).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('quest-message')).toContainText(
      `Claimed ${waiting.length} quests: ${waiting.map((q) => q.name).join(', ')}`,
    );
    await expect(all).toHaveCount(0);
    await expect(page.getByTestId('claim-pip')).toHaveCount(0);
  });

  test('Q04: on the pad, Quests lands on the one quest that waits, and A claims it', async ({
    page,
  }) => {
    // The same save with every waiting quest but one (a quest, not a contract) claimed already.
    const registry = createDefaultRegistry();
    let profile = economySim(registry, 1, 3).profile;
    const waiting = () => questStates(registry, profile).filter((q) => q.status === 'complete');
    while (waiting().length > 1) {
      const w = waiting();
      const res = claimQuest(registry, profile, (w.find((q) => q.kind === 'contract') ?? w[0]).id);
      expect(res.ok).toBe(true);
      profile = res.profile;
    }
    const [one] = waiting();
    expect(one.kind).not.toBe('contract');
    await seedSave(page, profile);
    await padToQuests(page);
    await expect(page.getByTestId('quest-claim-all')).toHaveCount(0);
    const row = page.getByTestId(`quest-${one.id}`);
    await expect(row).toHaveAttribute('aria-current', 'true');
    await expect(row).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('quest-message')).toContainText(`Claimed ${one.name}`);
    await expect(page.getByTestId('claim-pip')).toHaveCount(0);
    // With none left to claim, the claimed quest stays open, under Done.
    await expect(page.getByTestId('quest-group-done').getByTestId(`quest-${one.id}`)).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('Q02: a contract rerolls once a visit, for its price', async ({ page }) => {
    await seedProfile(page, 4242, false, undefined, { scrap: 500 });
    await page.goto('/delve');
    await page.getByTestId('tab-quests').click();
    // A new save's board is full.
    const slot = page.getByTestId('contract-slot-0').getByRole('button');
    const before = await slot.getAttribute('data-testid');
    await slot.click();
    const reroll = page.getByTestId('quest-reroll');
    await expect(reroll).toBeEnabled();
    await expect(reroll).toContainText(/\d+ scrap/);
    await reroll.click();
    // The slot holds a new contract (open now), the scrap is spent, and the visit's reroll with it.
    await expect(slot).not.toHaveAttribute('data-testid', before!);
    await expect(slot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('scrap-count')).not.toHaveText('500 scrap');
    await expect(reroll).toBeDisabled();
    await expect(page.getByTestId('quest-reroll-why')).toHaveText(
      'One reroll a visit: clear a depth to reroll again',
    );
  });
});
