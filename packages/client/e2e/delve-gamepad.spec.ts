import { test, expect, type Page } from '@playwright/test';
import {
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
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
 * `socket`, its first move has one open, empty socket and Quick III waits in the pouch.
 */
async function setup(
  page: Page,
  autopilot: boolean,
  primarySlots = 1,
  socket = false,
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

  test('G06: the D-pad and A pick a skill, a move and its kind in the chain builder', async ({
    page,
  }) => {
    await setup(page, false);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.down);
    await expect(page.getByTestId('chain-skill-primary')).toBeFocused();
    await tap(page, BUTTON.left);
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('chain-skill-basic')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.down);
    await expect(page.getByTestId('move-0')).toBeFocused();
    await tap(page, BUTTON.right);
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
    // Down past the card's reorder buttons to its kind chips (twice; on a phone the
    // fixed tab bar sits in between, one press more).
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    for (let i = 0; i < 4 && !(await focused()).startsWith('kind-'); i++) {
      await tap(page, BUTTON.down);
    }
    const chip = await focused();
    expect(chip).toMatch(/^kind-(medium|heavy|hold)$/);
    await tap(page, BUTTON.a);
    // A draft until Apply.
    await expect(page.getByTestId('chain-apply')).toBeVisible();
    expect((await blow()).kind).toBe('light');
    await page.getByTestId('chain-apply').click();
    await expect.poll(async () => (await blow()).kind).toBe(chip.slice('kind-'.length));
  });

  test('G07: the D-pad and A socket a pouch rune through the picker, and B backs out of it', async ({
    page,
  }) => {
    await setup(page, false, 1, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.down);
    await expect(page.getByTestId('chain-skill-primary')).toBeFocused();
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    /** Press down, then up, until `id` has the focus (on a phone the tab bar sits in between). */
    const padTo = async (id: string) => {
      for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, BUTTON.down);
      for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, BUTTON.up);
      expect(await focused()).toBe(id);
    };
    // The Primary's move: past its card and reorder buttons to its one open socket.
    await padTo('socket-0');
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

  test('G03: RB and LB step through the Anvil tabs', async ({ page }) => {
    await setup(page, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
  });
});
