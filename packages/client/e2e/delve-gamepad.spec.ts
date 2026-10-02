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
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
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
 * A fire hero's save, its sword's Primary at `primarySlots` slots of default moves; with
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
  const sword = profile.equipped.weapon!;
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
 * the other axis when that press was already made from here. The pad's nearest-in-direction
 * rule decides each step (right from the lane's last card meets the header's tabs before the
 * inspector), so the walk takes what the rule gives.
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
  test('G01: Menu opens the dive menu, its first control focused; A toggles it; B resumes', async ({
    page,
  }) => {
    await setup(page, true);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    await tap(page, BUTTON.menu);
    const toggle = page.getByTestId('attack-mode-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Auto');
    // The pad has the input lock: the focus goes straight to the menu's first control.
    await expect(toggle).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(toggle).toContainText('Manual');
    await tap(page, BUTTON.b);
    await expect(toggle).toBeHidden();
  });

  test('G02: LT dodges, and the hints switch to the controller', async ({ page }) => {
    await setup(page, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const dodge = page.getByTestId('dodge-button');
    await expect(dodge).toHaveAttribute('data-charges', '2', { timeout: ARENA_READY });
    expect(await tapAndReadCharges(page, BUTTON.lt)).toBe('1');
    await expect(dodge).toContainText('LT');
    // The Primary's slot names its pad button too.
    await expect(page.getByTestId('ability-0')).toContainText('RT');
  });

  test('G04: holding RT with the right stick aimed keeps casting the Primary, through its chain', async ({
    page,
  }) => {
    await setup(page, false, 2); // a light Bolt, then a medium one
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
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

  test('G05: rebind the dodge to A from the Controls editor mid-dive, and A dodges', async ({
    page,
  }) => {
    await setup(page, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
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
    await expect(page.getByTestId('attack-mode-toggle')).toBeHidden();

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
    // The skill list steps with LT / RT; the Primary is the one first chosen.
    await expect(page.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.lt);
    const basic = page.getByTestId('chain-skill-basic');
    await expect(basic).toHaveAttribute('aria-selected', 'true');
    await expect(basic).toBeFocused();
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.lt);
    await expect(basic).toHaveAttribute('aria-selected', 'true');
    // From the row, the chain's cards lie to the right.
    await tap(page, BUTTON.right);
    await expect(page.getByTestId('move-0')).toBeFocused();
    await tap(page, BUTTON.right);
    await expect(page.getByTestId('move-1')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    // The weapon carries the chains.
    const blow = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('alloy:delve:v2')!).equipped.weapon.moveset.chains
            .basic[1],
      );
    expect((await blow()).kind).toBe('light');
    // On to the inspector's kind radios, and along them past the light one.
    await padWalk(page, 'kind-medium');
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('kind-medium')).toHaveAttribute('aria-checked', 'true');
    // A draft until Apply.
    await expect(page.getByTestId('chain-apply')).toBeEnabled();
    expect((await blow()).kind).toBe('light');
    expect(await focused()).toBe('kind-medium');
    await page.getByTestId('chain-apply').click();
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
    // LT / RT step the skill list (the Primary is the one first chosen), focusing its row.
    await tap(page, BUTTON.lt);
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('chain-skill-primary')).toBeFocused();
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    /** Press down, then up, until `id` has the focus (on a phone the tab bar sits in between). */
    const padTo = async (id: string) => {
      for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, BUTTON.down);
      for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, BUTTON.up);
      expect(await focused()).toBe(id);
    };
    // From the row, right to the Primary's card's one open socket.
    await tap(page, BUTTON.right);
    await expect(page.getByTestId('socket-0')).toBeFocused();
    const picker = page.getByTestId('rune-picker');
    // A opens the picker, which takes the focus; B backs out, the focus back on the socket.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await expect.poll(focused).toMatch(/^rune-/);
    await tap(page, BUTTON.b);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('socket-0')).toBeFocused();
    // Again, and A on Quick sockets it: a draft until Apply.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await padTo('rune-pick-quick');
    await tap(page, BUTTON.a);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('socket-0')).toHaveAttribute('data-rune', 'quick:3');
    const sockets = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('alloy:delve:v2')!).equipped.weapon.moveset.chains.primary
            .moves[0].runes,
      );
    expect(await sockets()).toEqual([null]);
    await page.getByTestId('chain-apply').click();
    await expect.poll(sockets).toEqual([{ id: 'quick', tier: 3 }]);
  });

  test("G08: a bag weapon picked on the pad; RT reaches the compare pane's actions, A transfers and unequips, B goes back", async ({
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
    // RT jumps to the pane's first action, the footer says B goes back.
    await expect(page.locator('.k-prompt', { hasText: 'Actions' })).toBeVisible();
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('transfer-button')).toBeFocused();
    await expect(page.locator('.k-prompt', { hasText: 'Back to bag' })).toBeVisible();
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('bag-item')).toBeFocused();
    await expect(page.getByTestId('system-menu')).toBeHidden();
    // Again, and A moves the moveset onto the axe, which is worn now.
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('transfer-button')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(async () => (await save()).equipped.weapon?.uid).toBe('bag-axe');
    await expect(sheet).toContainText('Equipped · your weapon');
    // RT and A unequip it.
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('unequip-button')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(async () => (await save()).equipped.weapon?.uid).toBeUndefined();
    expect((await save()).bag.map((i: GearItem) => i.uid)).toContain('bag-axe');
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
