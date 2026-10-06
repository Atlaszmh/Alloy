import { test, expect, type Page } from '@playwright/test';
import {
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  generateItem,
  SeededRNG,
  type GearItem,
  type Moveset,
} from '@alloy/engine';
import { startDive } from './fixtures/delve';

/**
 * Controller support with a fake standard-mapping pad: Playwright has no real
 * gamepad, so `navigator.getGamepads` returns `window.__pad`, which the test
 * presses by hand.
 */

/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;

const BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** `moveset` with one open, empty socket on its Primary's first move. */
function withSocket(moveset: Moveset): Moveset {
  const primary = moveset.chains.primary!;
  const moves = primary.moves.map((m, i) => (i === 0 ? { ...m, runes: [null] } : m));
  return { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } };
}

/**
 * A fire hero's save, its sword uncommon (a new save's common sword carries no Primary) with
 * its Primary at `primarySlots` slots of default moves; with
 * `socket`, its first move has one open, empty socket and Quick III waits in the pouch; with
 * `bag`, the bag holds what `bag` makes.
 */
async function setup(
  page: Page,
  autopilot: boolean,
  primarySlots = 1,
  socket = false,
  bag: (registry: ReturnType<typeof createDefaultRegistry>) => GearItem[] = () => [],
): Promise<void> {
  const registry = createDefaultRegistry();
  const profile = createDelveProfile(registry, 4242, { primary: 'fire' });
  const sword = { ...profile.equipped.weapon!, rarity: 'uncommon' as const };
  const moveset = defaultMoveset(registry, sword, 'fire', { primary: primarySlots });
  const save = JSON.stringify({
    ...profile,
    equipped: {
      ...profile.equipped,
      weapon: { ...sword, moveset: socket ? withSocket(moveset) : moveset },
    },
    runes: socket ? { quick: [0, 0, 1, 0, 0] } : profile.runes,
    bag: [...profile.bag, ...bag(registry)],
  });
  await page.addInitScript(
    ([value, bot]) => {
      const w = window as unknown as { __pad: unknown };
      w.__pad = {
        connected: true,
        mapping: 'standard',
        index: 0,
        id: 'Fake Xbox controller',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null,
      };
      navigator.getGamepads = () => [w.__pad as Gamepad];
      if (sessionStorage.getItem('pad-e2e')) return;
      localStorage.clear();
      localStorage.setItem('alloy:delve:seen', '["loadout","skills","forge","quests","stop"]'); // every onboarding hint seen
      localStorage.setItem('alloy:delve:v2', value);
      if (bot) localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('pad-e2e', '1');
    },
    [save, autopilot] as const,
  );
}

/** Wait for the page to draw `n` frames (the controller is read once per frame). */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const step = (left: number) =>
          left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(count);
      }),
    n,
  );
}

/**
 * Press and release within the page, across one frame: the controller is read
 * once per frame, so it sees exactly one press (a longer hold can trigger the
 * D-pad's repeat when frames are slow under load).
 */
async function tap(page: Page, button: number): Promise<void> {
  await page.evaluate(
    (i) =>
      new Promise<void>((resolve) => {
        const pad = (
          window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }
        ).__pad;
        pad.buttons[i] = { pressed: true, value: 1 };
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            pad.buttons[i] = { pressed: false, value: 0 };
            resolve();
          }),
        );
      }),
    button,
  );
  await frames(page, 2);
}

/**
 * Press a button and read the dodge button's charges a few frames later, all
 * inside the page: with many test browsers the round trips are slow enough
 * for the charge to refill before a separate check could see it.
 */
async function tapAndReadCharges(page: Page, button: number): Promise<string | null> {
  return page.evaluate(
    (i) =>
      new Promise<string | null>((resolve) => {
        const pad = (
          window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }
        ).__pad;
        pad.buttons[i] = { pressed: true, value: 1 };
        let frames = 0;
        const tick = () => {
          frames++;
          if (frames === 2) pad.buttons[i] = { pressed: false, value: 0 };
          if (frames < 10) return void requestAnimationFrame(tick);
          resolve(
            document.querySelector('[data-testid="dodge-button"]')!.getAttribute('data-charges'),
          );
        };
        requestAnimationFrame(tick);
      }),
    button,
  );
}

/**
 * By D-pad to the control `id`: each press toward it, along the axis it lies further on, or
 * the other axis when that press was already made from here. The pad's rule decides each step
 * (inside a pane while it can, then into the pane that way), so the walk takes what the rule gives.
 */
async function padWalk(page: Page, id: string): Promise<void> {
  const tried = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const step = await page.evaluate((target) => {
      const from = document.activeElement;
      const to = document.querySelector(`[data-testid="${target}"]`);
      if (!from || !to || from === to) return null;
      const [a, b] = [from, to].map((e) => e.getBoundingClientRect());
      const dx = b.x + b.width / 2 - (a.x + a.width / 2);
      const dy = b.y + b.height / 2 - (a.y + a.height / 2);
      const h = dx < 0 ? 'left' : 'right';
      const v = dy < 0 ? 'up' : 'down';
      const at = from.getAttribute('data-testid') ?? '';
      return { at, dirs: Math.abs(dx) > Math.abs(dy) ? [h, v] : [v, h] } as const;
    }, id);
    if (!step) break;
    const dir = step.dirs.find((d) => !tried.has(`${step.at}:${d}`)) ?? step.dirs[0];
    tried.add(`${step.at}:${dir}`);
    await tap(page, BUTTON[dir]);
  }
  await expect(page.getByTestId(id)).toBeFocused();
}

test.describe('Delve with a controller', () => {
  test('G01: Menu opens the pause list on Resume; A on Build and quests opens the hub, where RB steps the tabs past the Forge and B goes back; B and Menu resume; View opens the hub on Quests', async ({
    page,
  }) => {
    await setup(page, true);
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    await tap(page, BUTTON.menu);
    const pause = page.getByTestId('pause-screen');
    const resume = pause.getByTestId('pause-resume');
    await expect(pause).toBeVisible();
    // The pad has the input lock: the focus goes straight to Resume.
    await expect(resume).toBeFocused();
    await tap(page, BUTTON.down);
    await expect(pause.getByTestId('pause-build')).toBeFocused();
    await tap(page, BUTTON.a);
    const hub = page.getByTestId('pause-hub');
    await expect(hub.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(hub.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    // The Forge is locked mid-dive: RB steps over it.
    await tap(page, BUTTON.rb);
    await expect(hub.getByTestId('tab-codex')).toHaveAttribute('aria-selected', 'true');
    await expect(hub.getByTestId('tab-forge')).toHaveAttribute('aria-selected', 'false');
    // B: back to the list, on the row that opened the hub; B again resumes.
    await tap(page, BUTTON.b);
    await expect(pause.getByTestId('pause-build')).toBeFocused();
    await tap(page, BUTTON.b);
    await expect(pause).toBeHidden();
    // Menu opens it on Resume again; Menu resumes; and so does A on Resume.
    await tap(page, BUTTON.menu);
    await expect(resume).toBeFocused();
    await tap(page, BUTTON.menu);
    await expect(pause).toBeHidden();
    await tap(page, BUTTON.menu);
    await expect(resume).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(pause).toBeHidden();
    // View, the journal, opens the hub on Quests directly; Menu there resumes.
    await tap(page, BUTTON.view);
    await expect(hub.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.menu);
    await expect(hub).toBeHidden();
  });

  test('G02: B dodges, and the hints switch to the controller', async ({ page }) => {
    await setup(page, false);
    await page.goto('/delve');
    await startDive(page);
    const dodge = page.getByTestId('dodge-button');
    await expect(dodge).toHaveAttribute('data-charges', '2', { timeout: ARENA_READY });
    expect(await tapAndReadCharges(page, BUTTON.b)).toBe('1');
    await expect(dodge).toContainText('B');
    // The Primary's slot names its pad button too.
    await expect(page.getByTestId('ability-0')).toContainText('RT');
  });

  test('G04: holding RT with the right stick aimed keeps casting the Primary, through its chain', async ({
    page,
  }) => {
    await setup(page, false, 2); // a light Bolt, then a medium one
    await page.goto('/delve');
    await startDive(page);
    const bar = page.getByTestId('mana-bar');
    await expect(bar).toBeVisible({ timeout: ARENA_READY });
    const mana = async () =>
      Number((await bar.getAttribute('aria-label'))!.match(/Mana (\d+)/)![1]);
    const primary = page.getByTestId('ability-0');
    await expect(primary).toHaveAttribute('aria-label', 'Primary: light Fire Bolt');
    const before = await mana();
    await page.evaluate(() => {
      const pad = (
        window as unknown as {
          __pad: { axes: number[]; buttons: { pressed: boolean; value: number }[] };
        }
      ).__pad;
      pad.axes = [0, 0, 0, -1];
      pad.buttons[7] = { pressed: true, value: 1 };
    });
    // Two or more Bolts outpace the regen while RT is held, stepping through the
    // chain, each waiting out the last one's beat (polling while held, since game
    // time runs slow when the machine is busy).
    await expect.poll(mana, { timeout: ARENA_READY }).toBeLessThan(before - 6);
    await expect
      .poll(() => primary.getAttribute('aria-label'), { timeout: ARENA_READY })
      .toBe('Primary: medium Fire Bolt');
    await page.evaluate(() => {
      const pad = (
        window as unknown as {
          __pad: { axes: number[]; buttons: { pressed: boolean; value: number }[] };
        }
      ).__pad;
      pad.axes = [0, 0, 0, 0];
      pad.buttons[7] = { pressed: false, value: 0 };
    });
  });

  test("G05: rebind the dodge to A from the pause's Controls editor, and A dodges", async ({
    page,
  }) => {
    await setup(page, false);
    await page.goto('/delve');
    await startDive(page);
    const dodge = page.getByTestId('dodge-button');
    await expect(dodge).toHaveAttribute('data-charges', '2', { timeout: ARENA_READY });

    await tap(page, BUTTON.menu);
    await page.getByTestId('open-controls').click();
    await page.getByTestId('bind-pad-dodge').click();
    await expect(page.getByTestId('bind-pad-dodge')).toContainText('Press');
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('bind-pad-dodge')).toHaveText('A');
    await tap(page, BUTTON.b); // closes the editor
    await expect(page.getByTestId('controls-panel')).toBeHidden();
    await tap(page, BUTTON.b); // resumes the dive
    await expect(page.getByTestId('pause-screen')).toBeHidden();

    expect(await tapAndReadCharges(page, BUTTON.a)).toBe('1');
    await expect(dodge).toContainText('A');
  });

  test('G06: LT/RT pick a skill, then the D-pad and A a move and its kind', async ({ page }) => {
    await setup(page, false);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    // RB lands on the Primary's chosen card; LT / RT step the strip, and the card keeps the focus.
    await expect(page.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('move-0')).toBeFocused();
    await tap(page, BUTTON.lt);
    const basic = page.getByTestId('chain-skill-basic');
    await expect(basic).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('move-0')).toBeFocused();
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.lt);
    await expect(basic).toHaveAttribute('aria-selected', 'true');
    // Along the chain's cards.
    await tap(page, BUTTON.right);
    await expect(page.getByTestId('move-1')).toBeFocused();
    // The weapon carries the chains.
    const blow = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('alloy:delve:v2')!).equipped.weapon.moveset.chains
            .basic[1],
      );
    expect((await blow()).kind).toBe('light');
    // A opens the move's editor; its first row, Kind, takes the focus.
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await expect(page.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    const kind = page.getByTestId('move-kind');
    await expect(kind).toBeFocused();
    await expect(kind).toHaveAttribute('aria-valuetext', 'Light');
    await tap(page, BUTTON.right);
    await expect(kind).toHaveAttribute('aria-valuetext', 'Medium');
    expect(await focused()).toBe('move-kind');
    // A draft until Apply.
    await expect(page.getByTestId('chain-apply')).toBeEnabled();
    expect((await blow()).kind).toBe('light');
    // B closes the editor onto its card.
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('move-editor')).toHaveCount(0);
    await expect(page.getByTestId('move-1')).toBeFocused();
    // Y opens the Apply sheet on its Apply; A applies.
    await tap(page, BUTTON.y);
    await expect(page.getByTestId('apply-sheet-confirm')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('apply-sheet')).toHaveCount(0);
    await expect.poll(async () => (await blow()).kind).toBe('medium');
  });

  test('G07: the D-pad and A socket a pouch rune through the picker, and B backs out of it', async ({
    page,
  }) => {
    await setup(page, false, 1, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    // RB lands on the Primary's chosen card.
    await expect(page.getByTestId('move-0')).toBeFocused();
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    /** Walk the D-pad (a grid now: each direction in turn) until `id` has the focus. */
    const padTo = async (id: string) => {
      for (const b of [BUTTON.down, BUTTON.right, BUTTON.up, BUTTON.left, BUTTON.down])
        for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, b);
      expect(await focused()).toBe(id);
    };
    // A opens the card's editor; down to its one open socket's row.
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await padTo('inspect-socket-0');
    const picker = page.getByTestId('rune-picker');
    // A opens the rune grid, which takes the focus; B backs out, the focus back on the row.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await expect.poll(focused).toMatch(/^rune-/);
    await tap(page, BUTTON.b);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('inspect-socket-0')).toBeFocused();
    // Again, and A on Quick sockets it: a draft until Apply.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await padTo('rune-pick-quick');
    await tap(page, BUTTON.a);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('chain-cards').getByTestId('socket-0')).toHaveAttribute(
      'data-rune',
      'quick:3',
    );
    const sockets = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('alloy:delve:v2')!).equipped.weapon.moveset.chains.primary
            .moves[0].runes,
      );
    expect(await sockets()).toEqual([null]);
    // Y in the editor opens the Apply sheet on its Apply; A applies.
    await tap(page, BUTTON.y);
    await expect(page.getByTestId('apply-sheet-confirm')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('apply-sheet')).toHaveCount(0);
    await expect.poll(sockets).toEqual([{ id: 'quick', tier: 3 }]);
  });

  test('G08: a bag weapon by the pad: A opens the take sheet, Transfer wears it with your moveset; X on the worn weapon unequips', async ({
    page,
  }) => {
    await setup(page, false, 1, false, (registry) => {
      const axe = generateItem(
        registry,
        { uid: 'bag-axe', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'axe', mana: 'fire' },
        new SeededRNG(4),
      );
      return [{ ...axe, moveset: defaultMoveset(registry, axe, 'fire') }];
    });
    await page.goto('/delve');
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('alloy:delve:v2')!));
    const sheet = page.getByTestId('item-sheet');
    // The D-pad's focus selects the bag's axe for the compare pane.
    await tap(page, BUTTON.down);
    await padWalk(page, 'bag-item');
    await expect(sheet).toContainText('Selected · compared with your weapon');
    // The verdict leads the pane, and the footer's A says what it does on this weapon.
    await expect(page.getByTestId('item-verdict')).toBeVisible();
    await expect(page.locator('.k-prompt', { hasText: 'Equip or transfer' })).toBeVisible();
    await expect(page.locator('.k-prompt', { hasText: 'Actions' })).toHaveCount(0);
    // The pane's buttons are the mouse's: right from the bag never lands on them.
    await tap(page, BUTTON.right);
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[data-testid="compare-actions"]'),
      ),
    ).toBe(false);
    await padWalk(page, 'bag-item');
    // A opens the take sheet; A on Transfer moves the moveset onto the axe, which is worn now.
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('take-sheet')).toBeVisible();
    await page.getByTestId('take-transfer').focus();
    await tap(page, BUTTON.a);
    await expect.poll(async () => (await save()).equipped.weapon?.uid).toBe('bag-axe');
    await expect(page.getByTestId('take-sheet')).toHaveCount(0);
    // X on the worn weapon unequips it.
    await page.getByTestId('slot-weapon').focus();
    await expect(sheet).toContainText('Equipped · your weapon');
    await tap(page, BUTTON.x);
    await expect.poll(async () => (await save()).equipped.weapon?.uid).toBeUndefined();
    expect((await save()).bag.map((i: GearItem) => i.uid)).toContain('bag-axe');
  });

  test('G09: X salvages the focused tile at once, B takes it back, and the offer ends after 5 s', async ({
    page,
  }) => {
    await setup(page, false, 1, false, (registry) => [
      generateItem(
        registry,
        { uid: 'bag-helm', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
        new SeededRNG(7),
      ),
    ]);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('alloy:delve:v2')!));
    const undo = page.locator('.k-prompt', { hasText: 'Undo salvage' });
    await tap(page, BUTTON.down); // the pad takes the input lock
    await padWalk(page, 'bag-item');
    // A rare helm is precious: it melts at once all the same.
    await tap(page, BUTTON.x);
    await expect.poll(async () => (await save()).bag.length).toBe(0);
    await expect(undo).toBeVisible();
    await tap(page, BUTTON.b);
    await expect
      .poll(async () => (await save()).bag.map((i: GearItem) => i.uid))
      .toEqual(['bag-helm']);
    await expect(undo).toHaveCount(0);
    // Again; the offer is gone after 5 s.
    await padWalk(page, 'bag-item');
    await tap(page, BUTTON.x);
    await expect.poll(async () => (await save()).bag.length).toBe(0);
    await expect(undo).toBeVisible();
    await expect(undo).toHaveCount(0, { timeout: 7_000 });
    expect((await save()).bag).toHaveLength(0);
  });

  test('G03: RB and LB step through the five Anvil tabs, wrapping round', async ({ page }) => {
    await setup(page, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    for (const tab of ['skills', 'forge', 'codex', 'quests', 'loadout']) {
      await tap(page, BUTTON.rb);
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    }
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
  });
});
