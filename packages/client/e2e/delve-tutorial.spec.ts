import { test, expect, type Locator, type Page } from '@playwright/test';
import { ARENA_READY, SAVE_KEY, seedProfile, startDive } from './fixtures/delve';
import { BUTTON, installPad, tap } from './fixtures/pad';

/**
 * The guided start (see the tutorial spec): a new save chooses Guided start, the engine bot plays
 * dive 1's hand-built floors (it follows each floor step on its own), and the test answers what
 * the player would: Continue on reading beats, "Skip this step" when offered, the stops' power-ups
 * and roads, then Anvil lesson 1 op by op through the hub. And a Jump in save has only the Basic
 * until its first forge.
 */

/**
 * A fresh save (no profile at all), the bot playing the arena if `bot`, with a resting fake pad
 * (`installPad`): it claims nothing until `tap`.
 */
async function fresh(page: Page, bot: boolean): Promise<void> {
  await installPad(page);
  await page.addInitScript((autopilot) => {
    // Every step Hesta's strip shows, in order (a step can pass between two polls): its
    // `data-step`, the step itself, never the finished objective the strip holds for a moment.
    const seen: string[] = [];
    (window as unknown as { __steps: string[] }).__steps = seen;
    new MutationObserver(() => {
      const id = document
        .querySelector('[data-testid="tutorial-panel"]')
        ?.getAttribute('data-step');
      if (id && seen[seen.length - 1] !== id) seen.push(id);
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-step'],
    });
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

const steps = (page: Page) =>
  page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);

/**
 * What the Depart sheet says of a new dive (the footer's Delve opens it, Esc shuts it): while a
 * lesson holds it, its Delve waits beside the reason; else no reason, and Delve is ready.
 */
async function expectDiveHeld(page: Page, held: boolean): Promise<void> {
  await page.getByTestId('depart-button').click();
  const sheet = page.getByTestId('depart-sheet');
  if (held) {
    await expect(sheet.getByTestId('delve-button')).toBeDisabled();
    await expect(sheet.getByTestId('lesson-block')).toHaveText("Finish Hesta's lesson or skip it");
  } else {
    await expect(sheet.getByTestId('lesson-block')).toHaveCount(0);
    await expect(sheet.getByTestId('delve-button')).toBeEnabled();
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
}

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
    /** The marker is on `target`: a trail's entry, a way to it, or the step's highlight. */
    const marked = (target: string) => expect(highlight).toHaveAttribute('data-target', target);
    await expect(panel.getByTestId('tutorial-line')).toContainText('new hand');
    // One objective strip: at the Anvil, the row under the header band.
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute('data-place', 'anvil');
    await expect(highlight).toBeVisible();
    expect(await step(page)).toBe('begin');
    await startDive(page);
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
    // In the dive, the one under the top bar.
    await expect(panel).toHaveAttribute('data-place', 'hud', { timeout: ARENA_READY });
    await expect(panel).toHaveCount(1);

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
        const seen = await steps(page);
        expect(seen.some((id) => id.startsWith('d1-exit'))).toBe(true);
        if (stops === 1) {
          expect(seen.indexOf('d1-weapon')).toBeLessThan(seen.indexOf('d1-exit'));
          // Stop 1: Equip is required; the roads wait for it.
          expect(await step(page)).toBe('s1-equip');
          // One strip, the stop's own, in its header row; the dive's HUD is not drawn under it.
          await expect(panel).toHaveCount(1);
          await expect(door.getByTestId('tutorial-panel')).toHaveAttribute('data-place', 'stop');
          await expect(page.getByTestId('purse-bar')).toBeHidden();
          await expect(door.getByTestId('roads-held')).toBeVisible();
          await expect(door.getByRole('button', { name: 'Skip power-up' })).toBeDisabled();
          await expect(roads).toHaveCount(0);
          // The marker leads both clicks: the card, then its picker.
          await marked('stop.card:equip');
          await door.getByTestId('stop-equip').click();
          await marked('stop.pick');
          await door.getByTestId('stop-equip-item').first().click();
          await expect(door.getByTestId('stop-taken')).toBeVisible();
          await marked('stop.doors');
          // The step's stop doesn't extract.
          await expect(door.getByTestId('extract-button')).toHaveCount(0);
          await expect(roads.first()).toBeEnabled();
          await roads.first().click();
        } else if (stops === 2) {
          // Stop 2: Adjust a move, paid with the chest's Mana Dust.
          await expect(roads).toHaveCount(0);
          await marked('stop.card:move');
          await door.getByTestId('stop-move').click();
          await marked('stop.pick');
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
        const go = page.getByTestId('tutorial-continue');
        if (beats === 1) {
          // By the pad: Continue has the focus (the highlight is on screen), and A presses it.
          await expect(go).toBeFocused();
          await tap(page, BUTTON.a);
          await expect(go).toBeHidden();
          // The mouse takes the input lock back for the rest of the dive (past MOUSE_CLAIM_PX).
          await page.mouse.move(20, 20);
          await page.mouse.move(80, 80, { steps: 4 });
        } else await go.click();
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

    // Anvil lesson 1: the Depart sheet's Delve waits for it, saying why.
    await expectDiveHeld(page, true);
    expect(await step(page)).toBe('l1-claim');
    await claimAll(page);

    // Forge an uncommon cuirass: the marker leads every click of the trail.
    await expect.poll(() => step(page)).toBe('l1-forge');
    await marked('hub.tab.forge');
    await page.getByTestId('tab-forge').click();
    await marked('forge.pattern:cuirass');
    await page.getByTestId('pattern-cuirass').click();
    // The Rusty bar is the bench's own first pick, done already: on to the flux.
    await marked('forge.flux:uncommon');
    await page.getByTestId('flux-uncommon').click();
    await marked('forge.shard');
    await page.getByTestId('shard-slot-0').click();
    // In the shard picker's own scope the picker is the target (the chest's Max Life shard).
    await expect(page.getByTestId('shard-picker')).toBeVisible();
    await marked('forge.shard');
    await page.getByTestId('shard-pick-maxHp-1').click();
    await marked('forge.go');
    await page.getByTestId('forge-button').click();

    // Wear it, by the pad: LB steps to the Loadout (the first press takes the input lock). The
    // marker's focus lands on the cuirass, a focused tile is selected, so that entry is done and
    // the marker and the focus move on to Equip; A equips.
    await expect.poll(() => step(page)).toBe('l1-equip');
    await marked('hub.tab.loadout');
    await tap(page, BUTTON.lb);
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('loadout-tab')).toBeVisible();
    await marked('loadout.equip');
    await expect(page.getByTestId('item-sheet')).toContainText('Cuirass');
    await expect(page.getByTestId('equip-button')).toBeFocused();
    await tap(page, BUTTON.a);

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
    await expectDiveHeld(page, true);
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
    await expectDiveHeld(page, false);
  });

  test('TU03: a view left open over the next step shows its way out, and the pad follows the marker', async ({
    page,
  }) => {
    // A save at the lesson's bind, with the Links the next step's slot costs.
    await seedProfile(page, 4242, false, undefined, {
      links: 3,
      tutorial: { step: 'l1-bind', count: 0, misses: 0 },
    });
    await installPad(page);
    await page.goto('/delve');
    const marker = page.getByTestId('tutorial-highlight');
    const marked = (target: string) => expect(marker).toHaveAttribute('data-target', target);

    // The bind lives in the Skills tab's Mana view: the marker leads there, way by way.
    await marked('hub.tab.skills');
    await page.getByTestId('tab-skills').click();
    await marked('skills.mana');
    await page.getByTestId('mana-realign').click();
    await marked('mana.bind');
    await page.getByTestId('mana-bind-frost').click();
    await marked('mana.confirm');

    // The pad takes over on the confirm: A binds, and the step moves on with the view still up.
    await page.getByTestId('mana-bind-confirm').focus();
    await tap(page, BUTTON.a);
    await expect.poll(() => step(page)).toBe('l1-skills');
    await expect(page.getByTestId('mana-view')).toBeVisible();
    await expect(page.getByTestId('ability-readout')).toHaveCount(0);
    // Nothing of the next step is in the view: the marker shows the way out, with the focus on it.
    await marked('back');
    await expect(page.getByTestId('mana-back')).toBeFocused();

    // One A later the inspector is back, and the marker and the focus are on Add slot.
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('mana-view')).toHaveCount(0);
    await expect(page.getByTestId('ability-readout')).toBeVisible();
    await marked('skills.addSlot');
    await expect(page.getByTestId('add-slot')).toBeFocused();
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
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.getByTestId('attack-button')).toBeVisible();
    await expect(page.getByTestId('ability-0')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-screen').getByTestId('pause-abandon').click();
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
    await startDive(page);
    await expect(page.getByTestId('ability-0')).toHaveAttribute('aria-label', /^Primary: /, {
      timeout: ARENA_READY,
    });
  });
});
