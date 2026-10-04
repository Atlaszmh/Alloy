import { test, expect, type Locator, type Page } from '@playwright/test';
import { ARENA_READY, SAVE_KEY } from './fixtures/delve';

/**
 * The guided start (see the tutorial spec): a new save chooses Guided start, the engine bot plays
 * dive 1's hand-built floors (it follows each floor step on its own), and the test answers what
 * the player would: Continue on reading beats, "Skip this step" when offered, the stops' power-ups
 * and roads, then Anvil lesson 1 op by op through the hub. And a Jump in save has only the Basic
 * until its first forge.
 */

/** A fresh save (no profile at all), the bot playing the arena if `bot`. */
async function fresh(page: Page, bot: boolean): Promise<void> {
  await page.addInitScript((autopilot) => {
    // Every objective Hesta's panel shows, in order (a step can pass between two polls).
    const seen: string[] = [];
    (window as unknown as { __objectives: string[] }).__objectives = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="tutorial-objective"]')?.textContent;
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
    if (sessionStorage.getItem('delve-e2e')) return;
    localStorage.clear();
    if (autopilot) localStorage.setItem('alloy:delve:autopilot', '1');
    localStorage.setItem('alloy:delve:timescale', '2');
    localStorage.setItem('alloy:muted', 'true');
    sessionStorage.setItem('delve-e2e', '1');
  }, bot);
}

/** The save's tutorial step, or null. */
async function step(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{}').tutorial?.step ?? null,
    SAVE_KEY,
  );
}

const objectives = (page: Page) =>
  page.evaluate(() => (window as unknown as { __objectives: string[] }).__objectives);

/** Claim every completed quest and contract on the Quests tab. */
async function claimAll(page: Page): Promise<void> {
  await page.getByTestId('tab-quests').click();
  const journal = page.getByTestId('quest-journal');
  const done = journal.getByRole('button').filter({ has: page.getByTestId('quest-done') });
  while ((await done.count()) > 0) {
    await done.first().click();
    await expect(page.getByTestId('tutorial-highlight')).toBeVisible();
    await page.getByTestId('quest-claim').click();
    await expect(page.getByTestId('quest-message')).toContainText('Claimed');
  }
}

/** Change one Primary move in the stop's Adjust a move picker (any kind it isn't). */
async function adjustMove(picker: Locator): Promise<void> {
  await picker.getByTestId('chain-skill-primary').click();
  for (const kind of ['heavy', 'medium', 'light']) {
    const chip = picker.getByTestId(`kind-${kind}`);
    if ((await chip.getAttribute('aria-checked')) !== 'true') {
      await chip.click();
      break;
    }
  }
}

test.describe('Delve guided start', () => {
  test('TU01: the bot plays dive 1 on the guided floors, then Anvil lesson 1 holds the Delve until done', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await fresh(page, true);
    await page.goto('/delve');

    // Guided start, then the mana as ever; Hesta's panel and her highlight on Delve.
    await page.getByTestId('guided-start').click();
    await page.getByTestId('mana-choice-fire').click();
    const panel = page.getByTestId('tutorial-panel');
    const highlight = page.getByTestId('tutorial-highlight');
    await expect(panel.getByTestId('tutorial-line')).toContainText('new hand');
    await expect(highlight).toBeVisible();
    expect(await step(page)).toBe('begin');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    // Dive 1: the bot fights; the test reads the beats and answers the stops.
    const door = page.getByTestId('door-choice');
    const summary = page.getByTestId('dive-summary');
    const roads = door.getByTestId('door-list').locator('[data-door]');
    let stops = 0;
    let beats = 0;
    const deadline = Date.now() + 300_000;
    while (!(await summary.isVisible())) {
      expect(Date.now(), 'dive 1 ends in time').toBeLessThan(deadline);
      if (await page.getByTestId('tutorial-retry').isVisible()) {
        await page.getByTestId('retry-depth').click();
      } else if (await door.isVisible()) {
        stops++;
        // A depth's exit stays held until its floor steps are done: the last objective before
        // the stop is the exit's.
        const seen = await objectives(page);
        expect(seen.some((t) => t.startsWith('Take the exit'))).toBe(true);
        if (stops === 1) {
          expect(seen.findIndex((t) => t === 'Pick up the weapon')).toBeLessThan(
            seen.findIndex((t) => t.startsWith('Take the exit')),
          );
          // Stop 1: Equip is required; the roads wait for it.
          expect(await step(page)).toBe('s1-equip');
          await expect(door.getByTestId('roads-held')).toBeVisible();
          await expect(roads.first()).toBeDisabled();
          await expect(door.getByTestId('extract-button')).toHaveCount(0);
          await expect(highlight).toBeVisible();
          await door.getByTestId('stop-equip').click();
          await door.getByTestId('stop-equip-item').first().click();
          await expect(door.getByTestId('stop-taken')).toBeVisible();
          await expect(roads.first()).toBeEnabled();
          await roads.first().click();
        } else if (stops === 2) {
          // Stop 2: Adjust a move, paid with the chest's Mana Dust.
          await expect(roads.first()).toBeDisabled();
          await door.getByTestId('stop-move').click();
          const picker = door.getByTestId('stop-picker');
          await adjustMove(picker);
          await picker.getByTestId('stop-move-take').click();
          await expect(door.getByTestId('stop-taken')).toBeVisible();
          await roads.first().click();
        } else {
          // Stop 3: home is the only road.
          await expect(roads).toHaveCount(0);
          await door.getByTestId('extract-button').click();
        }
        await expect(door).toBeHidden({ timeout: 15_000 });
      } else if (await page.getByTestId('tutorial-continue').isVisible()) {
        // A reading beat pauses the fight until Continue; the first (mana) points at the vitals.
        beats++;
        await expect(highlight).toBeVisible();
        await page.getByTestId('tutorial-continue').click();
      } else if (await page.getByTestId('tutorial-skip-step').isVisible()) {
        await page.getByTestId('tutorial-skip-step').click();
      }
      await page.waitForTimeout(100);
    }
    expect(stops).toBe(3);
    expect(beats).toBeGreaterThanOrEqual(2);
    await expect(summary).toContainText('EXTRACTED');
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();

    // Anvil lesson 1: Delve waits for it, saying why.
    const delve = page.getByTestId('delve-button');
    await expect(delve).toBeDisabled();
    await expect(page.getByTestId('lesson-block')).toHaveText("Finish Hesta's lesson or skip it");
    expect(await step(page)).toBe('l1-claim');
    await claimAll(page);

    // Forge an uncommon cuirass and wear it.
    await expect.poll(() => step(page)).toBe('l1-forge');
    await page.getByTestId('tab-forge').click();
    await page.getByTestId('pattern-cuirass').click();
    await page.getByTestId('flux-uncommon').click();
    await page.getByTestId('forge-button').click();
    await expect.poll(() => step(page)).toBe('l1-equip');
    await page.getByTestId('tab-loadout').click();
    await page.locator('[data-testid="bag-item"][aria-label*="Cuirass"]').first().click();
    await page.getByTestId('equip-button').click();

    // Bind the second element (Hesta's partner for fire is frost).
    await expect.poll(() => step(page)).toBe('l1-bind');
    await expect(panel.getByTestId('tutorial-line')).toContainText('Frost');
    await page.getByTestId('tab-skills').click();
    await page.getByTestId('mana-realign').click();
    await page.getByTestId('mana-bind-frost').click();
    await page.getByTestId('mana-bind-confirm').click();
    await expect.poll(() => step(page)).toBe('l1-skills');
    await page.getByTestId('mana-back').click();

    // The Primary: a slot, the new move in frost, a socket on the first move and the rune; Apply.
    await page.getByTestId('chain-skill-primary').click();
    const cards = page.getByTestId('chain-cards');
    await page.getByTestId('add-slot').click();
    await cards.getByTestId('move-2').click();
    await page.getByTestId('element-frost').click();
    await cards.getByTestId('move-0').click();
    await cards.getByTestId('sockets-0').getByTestId('socket-open').click();
    await cards.getByTestId('sockets-0').getByTestId('socket-0').click();
    await page.getByTestId('rune-picker').locator('[data-testid^="rune-pick-"]').first().click();
    await page.getByTestId('chain-apply').click();
    await expect.poll(() => step(page)).toBe('l1-salvage');

    // Salvage the old common sword, refine three Rusty bars into Iron.
    await page.getByTestId('tab-loadout').click();
    await page.locator('[data-testid="bag-item"][aria-label*="Sword, common"]').first().click();
    await expect(page.getByTestId('item-sheet')).toContainText('Common Rusty Sword');
    await page.getByTestId('salvage-button').click();
    await expect.poll(() => step(page)).not.toBe('l1-salvage');
    await expect(delve).toBeDisabled();
    // A step completes by what holds: an Iron bar from the floors (a bar's chance of the next
    // metal) passes the refine at once.
    if ((await step(page)) === 'l1-refine') {
      await page.getByTestId('tab-forge').click();
      await page.getByTestId('refine-metal-rusty').click();
    }
    await expect.poll(() => step(page)).toBe('l1-claim2');
    await claimAll(page);

    // The lesson is done: Delve opens for dive 2.
    await expect.poll(() => step(page)).toBe('delve-2');
    await expect(page.getByTestId('lesson-block')).toHaveCount(0);
    await expect(delve).toBeEnabled();
  });

  test('TU02: a Jump in save has only the Basic until its first forge gives it a Primary', async ({
    page,
  }) => {
    await fresh(page, false);
    await page.goto('/delve');
    await page.getByTestId('guided-jump').click();
    await page.getByTestId('mana-choice-fire').click();
    expect(await step(page)).toBeNull();
    await expect(page.getByTestId('tutorial-panel')).toHaveCount(0);

    // The common sword carries the Basic alone: no Primary slot in the dive.
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.getByTestId('attack-button')).toBeVisible();
    await expect(page.getByTestId('ability-0')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('dive-pause').getByTestId('pause-abandon').click();
    await page.getByTestId('return-camp').click();

    // The kit forges an uncommon sword: worn, it carries the Primary.
    await page.getByTestId('tab-forge').click();
    await page.getByTestId('pattern-sword').click();
    await page.getByTestId('flux-uncommon').click();
    await page.getByTestId('forge-button').click();
    await expect(page.getByTestId('forge-bench').getByRole('status')).toContainText('Forged');
    await page.getByTestId('tab-loadout').click();
    await page.locator('[data-testid="bag-item"][aria-label*=", uncommon"]').first().click();
    await page.getByTestId('equip-button').click();
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('ability-0')).toHaveAttribute('aria-label', /^Primary: /, {
      timeout: ARENA_READY,
    });
  });
});
