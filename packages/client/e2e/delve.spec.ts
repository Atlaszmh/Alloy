import { test, expect } from '@playwright/test';
import { ARENA_READY, FLOOR_CLEAR, seedProfile } from './fixtures/delve';

test.describe('Delve loot loop', () => {
  // A floor's clear may take most of the default two minutes under load.
  test.describe.configure({ timeout: 240_000 });
  test('D01: menu → anvil → dive → clear depth → extract → back to the anvil', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/');
    await page.getByTestId('menu-delve').click();

    await expect(page.getByTestId('delve-camp')).toBeVisible();
    await expect(page.getByTestId('paper-doll')).toBeVisible();
    await expect(page.getByTestId('delve-howto')).toBeVisible();

    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(page.locator('[data-testid="arena"] canvas')).toBeVisible({
      timeout: ARENA_READY,
    });
    // The canvas is sized in viewport px: no ancestor of its host may carry the HUD's zoom.
    const zoomed = await page.getByTestId('arena').evaluate((host) => {
      for (let p = host.parentElement; p; p = p.parentElement) {
        const z = getComputedStyle(p).zoom;
        if (z && z !== 'normal' && parseFloat(z) !== 1) return true;
      }
      return false;
    });
    expect(zoomed).toBe(false);
    await expect(page.getByTestId('hero-hp')).toBeVisible();
    // Each button names its chain's next move: the bot is already stepping through the
    // Primary's (G04 and T01 see its first move before any press).
    await expect(page.getByTestId('ability-0')).toHaveAttribute(
      'aria-label',
      /^Primary: (light|medium|heavy) Fire Bolt$/,
    );
    // The seeded sword is uncommon: it carries no Defensive or Ultimate, so they have no button.
    await expect(page.getByTestId('ability-1')).toHaveCount(0);
    await expect(page.getByTestId('ability-2')).toHaveCount(0);
    await expect(page.getByTestId('mana-bar')).toBeVisible();
    await expect(page.getByTestId('dodge-button')).toBeVisible();
    // Esc pauses the dive over the arena; Esc again (Resume) returns to the fight.
    await page.keyboard.press('Escape');
    const pause = page.getByTestId('dive-pause');
    await expect(pause).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pause).toBeHidden();

    const door = page.getByTestId('door-choice');
    const summary = page.getByTestId('dive-summary');
    await expect(door.or(summary)).toBeVisible({ timeout: FLOOR_CLEAR });

    if (await door.isVisible()) {
      await expect(page.getByTestId('bounty')).toHaveText(/[1-9]\d*/);
      await page.getByTestId('extract-button').click();
      await expect(summary).toContainText('EXTRACTED');
    }

    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
    await expect(page.getByTestId('scrap-count')).toHaveText(/[1-9][\d,]* scrap/);
    // How to delve stays until Strike the Anvil is claimed (a forge, after Bring It Home).
    await expect(page.getByTestId('delve-howto')).toBeVisible();
  });

  test('D02: loot drops mid-dive and can be inspected, then equipped at the Anvil', async ({
    page,
  }) => {
    // Only elites and bosses drop gear: seed 39's first floor, played by the bot to the exit,
    // drops gear at any frame rate (pinned in the engine's delve-banking test).
    await seedProfile(page, 39);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    // Inspected from the right column's "Found this floor" log: the pause opens on Loadout.
    const loot = page.getByTestId('pickup-feed').getByTestId('loot-item').first();
    await expect(loot).toBeVisible({ timeout: FLOOR_CLEAR });
    const name = (await loot.locator('span.truncate').textContent())!;
    await loot.click();
    const pause = page.getByTestId('dive-pause');
    await expect(pause).toBeVisible();
    // The compare pane shows the find it was opened on.
    await expect(pause.getByTestId('item-sheet')).toContainText(name);
    // Gear is locked mid-dive.
    await expect(pause.getByTestId('equip-button')).toHaveCount(0);
    await expect(pause.getByTestId('equip-locked')).toHaveText('Locked during the dive');

    // Abandon the dive (items are kept; it counts as a death: the summary, then the Anvil), and
    // equip it at the Anvil (answering an off-pair item's bind choice, which the compare pane
    // shows in place of Equip; the pane stays).
    await pause.getByRole('button', { name: 'Abandon · counts as a death' }).click();
    await expect(page.getByTestId('dive-summary')).toContainText('ABANDONED');
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
    const sheet = page.getByTestId('item-sheet');
    await page.getByTestId('bag-item').first().click();
    const notNow = page.getByTestId('bind-prompt-not-now');
    if (await notNow.isVisible()) await notNow.click();
    else await page.getByTestId('equip-button').click();
    await expect(sheet).toContainText('Equipped · your');
  });

  test('D03: the stop shows the floor, a power-up expanding in place, and a door to the next depth', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: FLOOR_CLEAR });
    await expect(door.getByRole('heading', { level: 1 })).toHaveText('Depth 1 cleared');
    await expect(door.getByTestId('risk-line')).toHaveText(
      /^Banked this dive · dying loses \d+% of it$/,
    );
    // At 1280×720 every door fits in its list, above Extract, without scrolling.
    await page.setViewportSize({ width: 1280, height: 720 });
    const list = door.getByTestId('door-list');
    await expect
      .poll(() => list.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(0);
    const doors = list.locator('[data-door]');
    const lastDoor = (await doors.nth((await doors.count()) - 1).boundingBox())!;
    const extract = (await door.getByTestId('extract-button').boundingBox())!;
    expect(lastDoor.y + lastDoor.height).toBeLessThanOrEqual(extract.y);
    await page.setViewportSize({ width: 1280, height: 800 });
    // The first card expands in place to its picker; Esc presses the picker's Back and the
    // focus returns to the card. Skipping the power-up is taking a door.
    const stop = door.getByTestId('stop');
    const card = stop.locator('[data-testid^="stop-"]').first();
    await card.click();
    const picker = stop.getByTestId('stop-picker');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(card).toBeFocused();
    await door.locator('[data-testid^="door-"]').first().click();
    await expect(door).toBeHidden();
    await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');
    await expect(page.getByTestId('rooms-explored')).toContainText('Rooms explored');
  });

  test('D07: diving again at the same depth starts a fresh floor', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: FLOOR_CLEAR });
    await page.getByTestId('extract-button').click();
    const summary = page.getByTestId('dive-summary');
    await expect(summary).toContainText('EXTRACTED');
    // No checkpoint yet, so "Dive again" starts at depth 1: the same key as the finished floor.
    await page.getByTestId('dive-again').click();
    await expect(summary).toBeHidden();
    await expect(page.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(page.getByTestId('rooms-explored')).toContainText('Rooms explored', {
      timeout: ARENA_READY,
    });
  });

  test("D11: materials ride the floor's haul, bank at the stop, and an abandon loses a share", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    // Picked up mid-floor: the purse counts this dive's materials, the Found log groups them.
    await expect(page.getByTestId('purse-materials')).toContainText(/\+[1-9]/, {
      timeout: FLOOR_CLEAR,
    });
    await expect(
      page.getByTestId('pickup-feed').getByTestId('feed-material').first(),
    ).toBeVisible();

    // Banked at the clear: the stop lists the floor's materials over the risk line.
    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: FLOOR_CLEAR });
    await expect(door.getByTestId('loot-material').first()).toBeVisible();
    await expect(door.getByTestId('risk-line')).toBeVisible();

    // Abandon counts as a death: the summary shows what the dive brought home and what it lost.
    await door.getByRole('button', { name: 'Menu' }).click();
    await page
      .getByTestId('dive-pause')
      .getByRole('button', { name: 'Abandon · counts as a death' })
      .click();
    const summary = page.getByTestId('dive-summary');
    await expect(summary).toContainText('ABANDONED');
    await expect(summary.getByTestId('dive-home')).toBeVisible();
    await expect(summary.getByTestId('dive-lost').getByTestId('haul-row').first()).toBeVisible();
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
  });

  test('D06: the ability bar fits on screen', async ({ page }) => {
    // No bot, so the fight (and the HUD) stays up while we measure.
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const bar = page.getByTestId('skill-bar');
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    const box = (await bar.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });

  test("D05: basic attacks switch between auto and manual from the pause's Controls", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
    await page.getByRole('button', { name: 'Dive menu' }).click();
    await page.getByTestId('open-controls').click();
    const toggle = page.getByTestId('attack-mode-toggle');
    await expect(toggle).toContainText('Auto');
    await toggle.click();
    await expect(toggle).toContainText('Manual');
    // The dock's Attack slot shows in both modes.
    await expect(page.getByTestId('attack-button')).toHaveAttribute('data-mode', 'manual');
    await toggle.click();
    await expect(toggle).toContainText('Auto');
    await expect(page.getByTestId('attack-button')).toHaveAttribute('data-mode', 'auto');
  });

  test('D04: the anvil abilities, forge and codex tabs render', async ({ page }) => {
    await seedProfile(page, 4242, true, 'nature', { links: 1, scrap: 20 });
    await page.goto('/delve');
    await expect(page.getByTestId('links-count')).toHaveText('1 Link');
    await expect(page.getByTestId('mana-strip')).toContainText('Skills');
    // The attunement strip opens Skills on its Mana view; Back shows the move inspector.
    await page.getByTestId('mana-strip').click();
    await expect(page.getByTestId('abilities-panel')).toBeVisible();
    await expect(page.getByTestId('mana-view')).toBeVisible();
    await page.getByTestId('mana-back').click();
    // The Primary's one move becomes a Wildfire Burst: a draft, free before the first dive.
    await page.getByTestId('form-burst').click();
    await page.getByTestId('infusion-nature').click();
    await expect(page.getByTestId('ability-readout')).toContainText('light Wildfire Burst');
    await expect(page.getByTestId('chain-price')).toContainText('free until your first dive');
    await page.getByTestId('chain-apply').click();
    await expect(page.getByTestId('chain-price')).toHaveText('No changes');
    const summary = page.getByTestId('abilities-summary');
    await expect(summary).toHaveText('light Wildfire Burst');
    // A Link and 20 scrap buy a second slot, holding the chain's next default move.
    await expect(page.getByTestId('chain-slots')).toHaveText('1 of 1 slots');
    await page.getByTestId('add-slot').click();
    await expect(summary).toHaveText('light Wildfire Burst · medium Wildfire Burst');
    await expect(page.getByTestId('chain-slots')).toHaveText('2 of 2 slots');
    await expect(page.getByTestId('move-add')).toHaveCount(0);
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('forge-panel')).toBeVisible();
    await expect(page.getByTestId('pattern-list')).toBeVisible();
    await page.getByTestId('bench-temper').click();
    await expect(page.getByTestId('temper-row')).toHaveCount(2);
    await page.getByTestId('tab-codex').click();
    await expect(page.getByTestId('codex-unknown')).toHaveCount(12);
    await page.getByTestId('codex-section-reactions').click();
    await expect(page.getByTestId('reaction-unknown')).toHaveCount(15);
  });

  test('D08: a new save asks Guided start or Jump in, then its mana; Frost starts with frost gear', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('delve-e2e')) return;
      localStorage.clear();
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('delve-e2e', '1');
    });
    await page.goto('/delve');
    await expect(page.getByTestId('guided-choice')).toBeVisible();
    await page.getByTestId('guided-jump').click();
    const choice = page.getByTestId('mana-choice');
    await expect(choice).toBeVisible();
    await page.getByTestId('mana-choice-frost').click();
    await expect(choice).toBeHidden();
    await page.getByTestId('tab-skills').click();
    // The common sword carries the Basic alone: the others show locked.
    const summary = page.getByTestId('abilities-summary');
    await page.getByTestId('chain-skill-primary').click();
    await expect(summary).toContainText('Carried by uncommon weapons and better');
    await page.getByTestId('chain-skill-defensive').click();
    await expect(summary).toContainText('Carried by rare weapons and better');
    // The paper doll is on the Loadout tab.
    await page.getByTestId('tab-loadout').click();
    await page.getByTestId('slot-weapon').click();
    await expect(page.getByTestId('item-mana')).toContainText('Frost');
  });

  test('D09: Esc opens and closes the pause, and in the Controls editor closes only the editor', async ({
    page,
  }) => {
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
    const menu = page.getByTestId('pause-screen');
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
    // Paused, Esc presses the pause's Resume: once, so the pause doesn't open again.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
    await page.getByTestId('open-controls').click();
    await expect(page.getByTestId('controls-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('controls-panel')).toBeHidden();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('D10: forging an item at the Anvil from the starting bars and flux', async ({ page }) => {
    // A new save knows the cuirass and holds 5 Rusty bars and uncommon flux (the starter kit).
    await seedProfile(page, 4242, false, undefined, { scrap: 500 });
    await page.goto('/delve');
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('bench-forge')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('pattern-cuirass').click();
    await page.getByTestId('flux-uncommon').click();
    await expect(page.getByTestId('forge-title')).toHaveText('Uncommon Cuirass');
    await expect(page.getByTestId('forge-refused')).toHaveCount(0);
    await page.getByTestId('forge-button').click();
    await expect(page.getByTestId('forge-bench').getByRole('status')).toContainText('Forged');
    await expect(page.getByTestId('material-metal-rusty')).toContainText('Rusty bar ×4');
    await page.getByTestId('tab-loadout').click();
    await expect(page.getByTestId('tab-loadout')).toContainText('NEW 1');
  });

  test("D12: a generated floor's vault opens on the interact key, and the gate asks before leaving", async ({
    page,
  }) => {
    // Seed 4's first floor holds a vault. The bot walks the floor, but stands at each
    // interactable until C is pressed, and the gate and an alcove open their dialogs.
    await seedProfile(page, 4, 'ask');
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    const plaque = page.getByTestId('interact-plaque');
    const confirm = page.getByTestId('exit-confirm');
    const door = page.getByTestId('door-choice');
    const used: string[] = [];
    let asked = 0;
    const deadline = Date.now() + FLOOR_CLEAR;
    while (!(await door.isVisible())) {
      expect(Date.now()).toBeLessThan(deadline);
      if (await confirm.isVisible()) {
        await expect(confirm.getByTestId('exit-unexplored')).toHaveText(
          /^(Every room explored\.|\d+ rooms? unexplored\.)$/,
        );
        if (asked++ === 0) {
          // Back has the focus (a second A never leaves); Esc stays on the floor.
          await expect(confirm.getByRole('button', { name: 'Back' })).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(confirm).toBeHidden();
        } else {
          await confirm.getByTestId('exit-leave').click();
        }
      } else if (await page.getByTestId('alcove-dialog').isVisible()) {
        await page.keyboard.press('Escape');
      } else if (await plaque.isVisible()) {
        // Read in one go: the bot may walk on past the prop (to a drop or a foe it saw). A busy
        // page answers slowly: give it the expect's 10 s, and pass over a plaque that went.
        const seen = await plaque
          .evaluate((el) => [el.getAttribute('data-interactable')!, el.textContent ?? ''], null, {
            timeout: 10_000,
          })
          .catch(() => null);
        if (seen) {
          const [kind, text] = seen;
          if (kind === 'chest') expect(text).toContain('Open');
          if (!used.includes(kind)) used.push(kind);
          await page.keyboard.press('c');
        }
      }
      await page.waitForTimeout(100);
    }
    expect(used).toContain('chest');
    expect(asked).toBe(2);
    await expect(door.getByRole('heading', { level: 1 })).toHaveText('Depth 1 cleared');
  });
});
