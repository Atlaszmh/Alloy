import { test, expect, type Page } from '@playwright/test';
import {
  beginFloor,
  completeFloor,
  createDefaultRegistry,
  defaultMoveset,
  economySim,
  generateItem,
  SeededRNG,
  startDive,
  type DataRegistry,
  type GearItem,
} from '@alloy/engine';
import { SAVE_KEY } from './fixtures/delve';

/**
 * The D-pad's whole map on the hub's screens (see the pad navigation spec, §1 and §3): on a
 * mid-game save with a filled bag, every control is reachable, none is reached while scrolled
 * out of another list, and the moves inside a pane reverse but for a recorded allowance; then
 * three walks with a fake pad through the screens that felt worst.
 */

const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, up: 12, down: 13, left: 14, right: 15 } as const;
type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * Moves inside a pane that don't reverse, per screen: [1280×800, 1920×1080]. A ratchet: ragged
 * layout (a wide control under two columns, a short last row) can't reverse, and a change that
 * adds to it must be looked at. Lower a number when the layout improves; never raise one
 * without reading the new moves (run with NAV_REPORT=1 to print them).
 */
const ALLOW: Record<string, [number, number]> = {
  loadout: [11, 7],
  'loadout-item': [11, 7],
  'junk-sheet': [0, 0],
  help: [0, 0],
  skills: [0, 0],
  'skills-editor': [0, 0],
  // The form grid's short last row: Strike, alone under Lance and Burst.
  'skills-forms': [2, 2],
  'apply-sheet': [0, 0],
  forge: [0, 0],
  'forge-pattern': [0, 0],
  temper: [0, 0],
  materials: [0, 0],
  codex: [0, 0],
  quests: [0, 0],
  depart: [0, 0],
  'system-menu': [0, 0],
  settings: [0, 0],
  'stop-powerup': [0, 0],
  'stop-road': [0, 0],
  'pause-list': [0, 0],
};

/**
 * The most D-pad stops a rebuilt screen may hold (the pad-first spec's Measures: the Evidence
 * table's targets as each screen is rebuilt). The stop's road holds the finds line, up to three
 * doors and Extract (the seeded hero's life is full: no potion).
 */
const CEILING: Record<string, number> = {
  // The audit's save: the doll's 7 slots, the bag's 12 tiles and its sort, Equip best, Salvage
  // junk, Auto-salvage and Delve (one stop a bag item: above the spec's 21 by its tiles alone).
  loadout: 24,
  'loadout-item': 24,
  // The junk sheet's Back, its 8 candidates and Salvage.
  'junk-sheet': 10,
  // Help's Back: its topics are a kit tab list, off the D-pad.
  help: 1,
  // The strip's Realign, the Primary's three cards and Delve (the strip's tabs are LT/RT's, the
  // footer's Revert and Apply the mouse's; no slot to buy on the audit save).
  skills: 5,
  // The move editor: Kind, Form, Elements, Position and Payment (no socket on its move; Back and
  // Remove are B's and X's).
  'skills-editor': 5,
  // The Primary's five forms (Back is B's).
  'skills-forms': 5,
  // The Apply sheet: its Back, Apply, Try in Training and Discard changes.
  'apply-sheet': 4,
  // The 9 learned patterns and Delve; with a pattern open, its Flux, Metal and Element rows and Forge.
  forge: 10,
  'forge-pattern': 14,
  // The 19 gear rows, the one operation the worn weapon can take, and Delve (one stop a gear row).
  temper: 21,
  // The audit's save: the shard bench's stepper and Buy, its Refines, and Delve.
  materials: 5,
  'stop-powerup': 4,
  'stop-road': 5,
  'pause-list': 8,
};

/** A dozen bag items of mixed slots and rarities, two of them weapons. */
function bagOf(registry: DataRegistry): GearItem[] {
  const slots = ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet'] as const;
  const rarities = ['common', 'uncommon', 'magic', 'rare', 'epic'] as const;
  return Array.from({ length: 12 }, (_, i) => {
    const slot = slots[i % slots.length];
    const item = generateItem(
      registry,
      {
        uid: `audit-${i}`,
        ilvl: 4,
        rarity: rarities[i % rarities.length],
        slot,
        mana: i % 2 ? 'fire' : 'frost',
      },
      new SeededRNG(100 + i),
    );
    return slot === 'weapon' ? { ...item, moveset: defaultMoveset(registry, item, 'fire') } : item;
  });
}

/**
 * A mid-game save (three dives of the autopilot) with a filled bag, and a fake pad to press; with
 * `atStop`, its next dive's first floor cleared, so it opens at the stop (its bag offers Equip).
 */
async function seed(page: Page, atStop = false): Promise<void> {
  const registry = createDefaultRegistry();
  const sim = economySim(registry, 1, 3).profile;
  // Mana Dust for PN07's element edit (three dives in, an edit is no longer free).
  let profile = { ...sim, manaDust: sim.manaDust + 500, bag: [...sim.bag, ...bagOf(registry)] };
  if (atStop) {
    profile = startDive(registry, profile, 1);
    profile = completeFloor(registry, profile, beginFloor(registry, profile)).profile;
  }
  const save = JSON.stringify(profile);
  await page.addInitScript(
    ([key, value]) => {
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
      if (sessionStorage.getItem('pad-nav-e2e')) return;
      localStorage.clear();
      localStorage.setItem('alloy:delve:seen', '["loadout","skills","forge","quests","stop"]'); // every onboarding hint seen
      localStorage.setItem(key, value);
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('pad-nav-e2e', '1');
    },
    [SAVE_KEY, save] as const,
  );
}

/** Press and release within the page, across frames: the pad is read once a frame. */
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
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
        );
      }),
    button,
  );
}

interface Report {
  stops: number;
  unreachable: string[];
  clipped: string[];
  unreversed: string[];
}

/** The topmost scope's whole D-pad map, by the page's own rule with the memory off. */
async function audit(page: Page): Promise<Report> {
  return page.evaluate(async () => {
    const nav = await import('/src/features/gamepad/use-gamepad-nav.ts' as string);
    const prompts = await import('/src/features/delve/kit/prompts.ts' as string);
    const scope = prompts.topScope() as HTMLElement | Document;
    const shown = (el: HTMLElement) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    // Every stop, the rows scrolled out of their lists too: each must be reachable by walking.
    const all = [...scope.querySelectorAll<HTMLElement>(nav.FOCUSABLE)].filter(
      (el) => shown(el) && !el.closest('[data-pad-skip]'),
    );
    const label = (el: HTMLElement) =>
      `#${all.indexOf(el)} ${
        el.getAttribute('data-testid') ??
        el.getAttribute('aria-label') ??
        (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 20)
      }`;
    const scroller = (el: Element): Element | null => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/auto|scroll/.test(s.overflowX + s.overflowY)) return p;
      }
      return null;
    };
    const outOfView = (el: Element): boolean => {
      const p = scroller(el);
      if (!p) return false;
      const [b, c] = [el.getBoundingClientRect(), p.getBoundingClientRect()];
      return b.right <= c.left || b.left >= c.right || b.bottom <= c.top || b.top >= c.bottom;
    };
    const groupOf = (el: HTMLElement) => el.closest('[data-pad-group]') ?? el;
    const dirs = ['up', 'down', 'left', 'right'] as const;
    const opp = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    /** A press from `el`, scrolled into view as focusing it would. A slider, a list or a stepper takes left/right itself. */
    const next = (el: HTMLElement, d: (typeof dirs)[number]): HTMLElement | null => {
      const own =
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLInputElement && el.type === 'range') ||
        el.matches('[data-pad-step]');
      if (own && (d === 'left' || d === 'right')) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return nav.nextFocus(el, d, { memory: false });
    };
    const clipped: string[] = [];
    const unreversed: string[] = [];
    for (const el of all) {
      for (const d of dirs) {
        const to = next(el, d);
        if (!to) continue;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (outOfView(to) && scroller(to) !== scroller(el)) clipped.push(`${label(el)} ${d} ${label(to)}`);
        if (groupOf(to) !== groupOf(el)) continue;
        const back = next(to, opp[d]);
        if (back !== el) unreversed.push(`${label(el)} ${d} ${label(to)}, back ${back ? label(back) : 'nowhere'}`);
      }
    }
    const start = all.find((el) => el === document.activeElement) ?? all.find((el) => !outOfView(el))!;
    const seen = new Set<HTMLElement>([start]);
    const queue = [start];
    while (queue.length) {
      const el = queue.pop()!;
      for (const d of dirs) {
        const to = next(el, d);
        if (to && !seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    return {
      stops: all.length,
      unreachable: all.filter((el) => !seen.has(el)).map(label),
      clipped,
      unreversed,
    };
  });
}

/**
 * The fewest D-pad presses from the focused control to `selector`'s first match: a BFS over the
 * page's own `nextFocus` with the memory off, as `audit` walks the map (a stepper's left/right
 * step it, so they are no moves). -1 when the target is not reached.
 */
async function presses(page: Page, selector: string): Promise<number> {
  return page.evaluate(async (sel) => {
    const nav = await import('/src/features/gamepad/use-gamepad-nav.ts' as string);
    const target = document.querySelector<HTMLElement>(sel);
    const start = document.activeElement;
    if (!target || !(start instanceof HTMLElement)) return -1;
    const dirs = ['up', 'down', 'left', 'right'] as const;
    const dist = new Map<HTMLElement, number>([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const el = queue.shift()!;
      if (el === target) return dist.get(el)!;
      for (const d of dirs) {
        if (el.matches('[data-pad-step]') && (d === 'left' || d === 'right')) continue;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const to = nav.nextFocus(el, d, { memory: false }) as HTMLElement | null;
        if (to && !dist.has(to)) {
          dist.set(to, dist.get(el)! + 1);
          queue.push(to);
        }
      }
    }
    return -1;
  }, selector);
}

/** The spec's press budget: an everyday task in at most this many D-pad presses, plus its face buttons. */
const BUDGET = 6;

/** Audit the screen now showing as `name` and hold it to the rules. */
async function check(page: Page, name: string, min = 2): Promise<void> {
  await page.waitForTimeout(300);
  const r = await audit(page);
  const wide = test.info().project.name === 'desktop-1080' ? 1 : 0;
  if (process.env.NAV_REPORT)
    console.log(`${name} (${test.info().project.name}): ${r.stops} stops, ${r.unreversed.length} unreversed\n  ${r.unreversed.join('\n  ')}`);
  expect(r.stops, `${name} has stops`).toBeGreaterThanOrEqual(min);
  expect(r.unreachable, `${name}: every stop is reachable`).toEqual([]);
  expect(r.clipped, `${name}: no move lands on a row scrolled out of another list`).toEqual([]);
  expect(r.unreversed.length, `${name}: moves inside a pane that don't reverse\n${r.unreversed.join('\n')}`).toBeLessThanOrEqual(ALLOW[name][wide]);
  if (CEILING[name]) expect(r.stops, `${name}: at most ${CEILING[name]} stops`).toBeLessThanOrEqual(CEILING[name]);
}

const click = (page: Page, id: string) => page.getByTestId(id).first().click();

/** Where the focus is: its test id, its group's (pane's) test id or class, and whether it is in the footer. */
async function where(page: Page): Promise<{ id: string; group: string; foot: boolean; tab: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const g = el.closest('[data-pad-group]') ?? el;
    return {
      id: el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 20) ?? '',
      group: g.getAttribute('data-testid') ?? g.className,
      foot: !!el.closest('[data-screen-section="screen-foot"]'),
      tab: el.getAttribute('role') === 'tab' && !!el.closest('[data-pad-skip]'),
    };
  });
}

/** Mark the focused control, so a walk can tell it came back to it. */
const mark = (page: Page, name: string) =>
  page.evaluate((n) => (document.activeElement as HTMLElement).setAttribute('data-walk', n), name);
const marked = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('data-walk'));

/**
 * Press `dir` until the focus is in another group (at most `max` presses); the last control it
 * held in this one is marked `name`. Returns the group left.
 */
async function leave(page: Page, dir: Dir, name: string, max = 8): Promise<string> {
  const from = (await where(page)).group;
  for (let i = 0; i < max; i++) {
    await mark(page, name);
    await tap(page, BUTTON[dir]);
    if ((await where(page)).group !== from) return from;
    // Still inside: the newly focused control is the one a return must find.
    await page.evaluate((n) => {
      for (const el of document.querySelectorAll(`[data-walk="${n}"]`))
        if (el !== document.activeElement) el.removeAttribute('data-walk');
    }, name);
  }
  throw new Error(`${dir} never left ${from}`);
}

/** Press `dir` until the focus is back on a control marked `name` (at most `max` presses). */
async function back(page: Page, dir: Dir, name: string, max = 6): Promise<void> {
  for (let i = 0; i < max; i++) {
    await tap(page, BUTTON[dir]);
    if ((await marked(page)) === name) return;
  }
  expect(await marked(page), `${dir} comes back to where the pane was left`).toBe(name);
}

test.describe('Delve pad navigation', () => {
  test('PN01: every hub screen is walkable: all reachable, none clipped, panes reverse', async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page);
    await page.goto('/delve');
    await expect(page.getByTestId('depart-button')).toBeVisible();
    await check(page, 'loadout');
    await click(page, 'bag-item');
    await check(page, 'loadout-item');
    await click(page, 'salvage-junk');
    await expect(page.getByTestId('junk-sheet')).toBeVisible();
    await check(page, 'junk-sheet');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('junk-sheet')).toHaveCount(0);
    await click(page, 'tab-skills');
    await check(page, 'skills');
    // The move editor over the audit save's Primary (its first card), its form grid, and the
    // Apply sheet over a change.
    await click(page, 'move-0');
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await check(page, 'skills-editor');
    await click(page, 'move-form');
    await expect(page.getByTestId('form-picker')).toBeVisible();
    await check(page, 'skills-forms');
    await page.keyboard.press('Escape'); // the grid's Back
    await expect(page.getByTestId('form-picker')).toHaveCount(0);
    await page.getByTestId('move-kind').press('ArrowRight'); // a change, so the sheet has one
    await page.keyboard.press('Escape'); // the editor's Back
    await expect(page.getByTestId('move-editor')).toHaveCount(0);
    await click(page, 'chain-apply');
    await expect(page.getByTestId('apply-sheet')).toBeVisible();
    await check(page, 'apply-sheet');
    await click(page, 'apply-sheet-discard');
    await expect(page.getByTestId('apply-sheet')).toHaveCount(0);
    await click(page, 'tab-forge');
    await check(page, 'forge');
    await click(page, 'pattern-cuirass');
    await check(page, 'forge-pattern');
    await page.getByRole('tab', { name: /Temper/ }).click();
    await check(page, 'temper');
    await click(page, 'bench-materials');
    await check(page, 'materials');
    await click(page, 'tab-codex');
    await check(page, 'codex');
    await click(page, 'tab-quests');
    await check(page, 'quests');
    await click(page, 'depart-button');
    await expect(page.getByTestId('depart-sheet')).toBeVisible();
    await check(page, 'depart');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('depart-sheet')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('open-settings')).toBeVisible();
    await check(page, 'system-menu');
    await click(page, 'open-help');
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    // Help's one stop is its Back: the topics are a kit tab list, off the D-pad.
    await check(page, 'help', 1);
    await page.keyboard.press('Escape'); // back to the menu
    await expect(page.getByTestId('open-settings')).toBeVisible();
    await click(page, 'open-settings');
    await check(page, 'settings');
  });

  test('PN02: Loadout: out of the bag and back lands on the same tile, by the doll and by the footer', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await page.getByTestId('bag-item').nth(4).focus();
    // The pad takes the input lock with a D-pad press (A on a tile would equip it); the press
    // may move too, so focus the tile again.
    await tap(page, BUTTON.up);
    await page.getByTestId('bag-item').nth(4).focus();
    // The compare pane has no stops: the way out sideways is the doll's.
    await leave(page, 'left', 'tile');
    expect((await where(page)).foot).toBe(false);
    await back(page, 'right', 'tile');
    const bag = await leave(page, 'down', 'low');
    expect((await where(page)).foot).toBe(true);
    // Down from tile 4's column reaches a footer control under the bag (at both sizes), so up
    // goes back into the bag, to the control it was left on.
    await tap(page, BUTTON.up);
    const at = await where(page);
    expect(at.foot).toBe(false);
    expect(at.group).toBe(bag);
    expect(await marked(page)).toBe('low');
  });

  test("PN03: Skills: RB lands on the chosen card; up to the strip's Realign, down to the footer, and straight back", async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    // LB/RB never leave the focus on a tab: the chosen card leads.
    expect((await where(page)).tab).toBe(false);
    await expect(page.locator('[data-testid^="move-"][data-pad-first]')).toBeFocused();
    await leave(page, 'up', 'card');
    expect((await where(page)).id).toBe('mana-realign');
    await back(page, 'down', 'card');
    await leave(page, 'down', 'card');
    expect((await where(page)).foot).toBe(true);
    await back(page, 'up', 'card');
    // A opens the card's editor (its own scope: the focus goes in); B comes back to the card.
    await mark(page, 'card');
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="move-editor"]')),
    ).toBe(true);
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('move-editor')).toHaveCount(0);
    expect(await marked(page)).toBe('card');
  });

  test('PN04: Forge by the pad: A on a pattern lands on the first row (Flux, or Metal with no flux held), right steps a row, down reaches Forge and left the patterns; RT goes to Temper, then Materials', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await click(page, 'tab-forge');
    await page.getByTestId('pattern-cuirass').focus();
    await tap(page, BUTTON.up); // the pad takes the input lock (and moves within the list)
    await page.getByTestId('pattern-cuirass').focus();
    await mark(page, 'pattern');
    await tap(page, BUTTON.a);
    // A save with no flux sees its Flux row as one line, and A lands on the Metal row; with flux,
    // on the Flux row, and down reaches the Metal row, whose right steps Rusty to Iron.
    const fluxRow = (await page.getByTestId('forge-flux').count()) > 0;
    expect((await where(page)).id).toBe(fluxRow ? 'forge-flux' : 'forge-metal');
    if (fluxRow) await tap(page, BUTTON.down);
    expect((await where(page)).id).toBe('forge-metal');
    const metal = page.getByTestId('forge-metal');
    await expect(metal).toHaveAttribute('aria-valuetext', /^Rusty bar/);
    await tap(page, BUTTON.right);
    expect((await where(page)).id).toBe('forge-metal'); // a step never moves the focus
    await expect(metal).toHaveAttribute('aria-valuetext', /^Iron bar/);
    // Down the rows to Forge, then left: back to the patterns.
    let presses = 0;
    while ((await where(page)).id !== 'forge-button' && presses++ < 8) await tap(page, BUTTON.down);
    expect((await where(page)).id).toBe('forge-button');
    await tap(page, BUTTON.left);
    expect((await where(page)).group).toBe('pattern-list');
    // RT steps to Temper: the focus lands on its gear list, then on to Materials.
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
    expect((await where(page)).id).toBe('temper-row');
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('bench-materials')).toHaveAttribute('aria-selected', 'true');
    const at = await where(page);
    expect(at.tab).toBe(false);
    expect(at.foot).toBe(false);
  });

  test('PN05: Menu opens the system menu, whose list wraps; View opens the Depart sheet and A dives', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await expect(page.getByTestId('depart-button')).toBeVisible();
    await tap(page, BUTTON.up); // the pad takes the input lock

    await tap(page, BUTTON.menu);
    await expect(page.getByTestId('system-menu')).toBeVisible();
    expect((await where(page)).id).toBe('menu-resume');
    // Down from Resume comes back round to it (the dev chips and Back are on the way).
    let presses = 0;
    do {
      await tap(page, BUTTON.down);
      presses++;
    } while ((await where(page)).id !== 'menu-resume' && presses < 12);
    expect((await where(page)).id).toBe('menu-resume');
    expect(presses).toBeGreaterThan(3);
    // And B closes it: no dive began.
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('system-menu')).toHaveCount(0);
    await expect(page).toHaveURL(/\/delve$/);

    // B at the root does nothing (on the bag: B is Undo only while a salvage can be taken back).
    await page.getByTestId('bag-item').first().focus();
    await tap(page, BUTTON.b);
    await page.waitForTimeout(200);
    await expect(page.getByTestId('system-menu')).toHaveCount(0);
    await expect(page.getByTestId('depart-sheet')).toHaveCount(0);
    await expect(page).toHaveURL(/\/delve$/);

    await tap(page, BUTTON.view);
    await expect(page.getByTestId('depart-sheet')).toBeVisible();
    expect((await where(page)).id).toBe('delve-button');
    await tap(page, BUTTON.a);
    await expect(page).toHaveURL(/\/delve\/run$/);
  });
  test('PN06: the stop by the pad: the cards, X to the road, B back; Menu opens the pause list on Resume, B resumes', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, true);
    await page.goto('/delve/run');
    const stop = page.getByTestId('door-choice');
    await expect(stop).toBeVisible({ timeout: 30_000 });
    // The stop wakes ARM_MS after it mounts.
    await expect(stop.locator('main > div')).not.toHaveAttribute('inert', '');
    await tap(page, BUTTON.up); // the pad takes the input lock
    await stop.locator('[data-pad-first]').focus();
    expect((await where(page)).id).toMatch(/^stop-(equip|slot|move|upgrade|rune)$/);
    await check(page, 'stop-powerup');

    await tap(page, BUTTON.x);
    await expect(stop.getByTestId('stop-road')).toBeVisible();
    expect((await where(page)).id).toMatch(/^door-/);
    await check(page, 'stop-road');

    await tap(page, BUTTON.b);
    await expect(stop.getByTestId('stop-powerup')).toBeVisible();
    expect((await where(page)).id).toMatch(/^stop-/);

    await tap(page, BUTTON.menu);
    await expect(page.getByTestId('pause-screen')).toBeVisible();
    expect((await where(page)).id).toBe('pause-resume');
    await check(page, 'pause-list');
    // Down from the last row comes back round (the list wraps, its Back included).
    let presses = 0;
    do {
      await tap(page, BUTTON.down);
      presses++;
    } while ((await where(page)).id !== 'pause-resume' && presses < 10);
    expect((await where(page)).id).toBe('pause-resume');
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('pause-screen')).toHaveCount(0);
    await expect(stop.getByTestId('stop-powerup')).toBeVisible();
  });

  test("PN07: the press budgets: equip an upgrade, salvage an item, forge an item and change a move's element and apply, each in six D-pad presses or fewer", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.goto('/delve');
    const save = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
    /** The tab's landing: the pad takes the input lock, and the focus is where the tab puts it. */
    const land = async (selector: string) => {
      await page.locator(selector).first().focus();
      await tap(page, BUTTON.up);
      await page.locator(selector).first().focus();
    };

    // 1. Equip an upgrade: from the Loadout's landing (the bag's first tile) to the first ▲ that
    //    isn't a weapon (A on a weapon may ask through the take sheet), then A.
    await land('[data-testid="bag-item"][data-pad-first]');
    const up = '[data-testid="bag-item"][data-delta="up"]:not([data-tutorial^="loadout.bag:weapon"])';
    const equip = await presses(page, up);
    if (process.env.NAV_REPORT) console.log(`PN07 (${test.info().project.name}): equip ${equip}`);
    expect(equip, 'equip an upgrade: D-pad presses').toBeGreaterThanOrEqual(0);
    expect(equip).toBeLessThanOrEqual(BUDGET);
    const uid = await page.locator(up).first().getAttribute('data-uid');
    await page.locator(up).first().focus();
    await tap(page, BUTTON.a);
    await expect
      .poll(async () => Object.values((await save()).equipped).some((i) => (i as GearItem | undefined)?.uid === uid))
      .toBe(true);

    // 2. Salvage an item: RT to the Weapons filter, then to the common weapon `bagOf` seeded, X.
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('bag-filter-weapons')).toHaveAttribute('aria-selected', 'true');
    const junk = '[data-uid="audit-0"]';
    const salvage = await presses(page, junk);
    if (process.env.NAV_REPORT) console.log(`PN07 (${test.info().project.name}): salvage ${salvage}`);
    expect(salvage, 'salvage an item: D-pad presses').toBeGreaterThanOrEqual(0);
    expect(salvage).toBeLessThanOrEqual(BUDGET);
    await page.locator(junk).focus();
    await tap(page, BUTTON.x);
    await expect.poll(async () => (await save()).bag.some((i: GearItem) => i.uid === 'audit-0')).toBe(false);
    // And B takes it back.
    await tap(page, BUTTON.b);
    await expect.poll(async () => (await save()).bag.some((i: GearItem) => i.uid === 'audit-0')).toBe(true);

    // 3. Forge an item: RB twice to the Forge, A on the pattern it lands on, a flux if one is held,
    //    then Forge.
    await tap(page, BUTTON.rb);
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('bench-forge')).toHaveAttribute('aria-selected', 'true');
    const pattern = await presses(page, '[data-testid^="pattern-"][data-pad-first]');
    await page.locator('[data-testid^="pattern-"][data-pad-first]').focus();
    await tap(page, BUTTON.a);
    // The first row takes the focus: Flux, or Metal when the save holds no flux (its row folded).
    const fluxRow = (await page.getByTestId('forge-flux').count()) > 0;
    await expect(page.getByTestId(fluxRow ? 'forge-flux' : 'forge-metal')).toBeFocused();
    const flux =
      fluxRow && (await page.getByTestId('forge-flux').getAttribute('aria-valuemax')) !== '0' ? 1 : 0;
    if (flux) await tap(page, BUTTON.right);
    const toForge = await presses(page, '[data-testid="forge-button"]');
    const forge = pattern + flux + toForge;
    if (process.env.NAV_REPORT) console.log(`PN07 (${test.info().project.name}): forge ${forge} (${pattern} + ${flux} + ${toForge})`);
    expect(forge, `forge an item: ${pattern} to the pattern, ${flux} for the flux, ${toForge} to Forge`).toBeLessThanOrEqual(BUDGET);
    const bag = (await save()).bag.length;
    await page.getByTestId('forge-button').focus();
    await tap(page, BUTTON.a);
    await expect.poll(async () => (await save()).bag.length).toBe(bag + 1);

    // 4. Change a move's element and apply: LB from the Forge to Skills (the chosen card leads),
    //    A on it, down to Elements, one step, then Y and A.
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    const card = '[data-testid^="move-"][data-pad-first]';
    const toCard = await presses(page, card);
    await page.locator(card).focus();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await expect(page.getByTestId('move-kind')).toBeFocused(); // the editor's first row
    const toElements = await presses(page, '[data-testid="move-elements"]');
    const els = page.getByTestId('move-elements');
    await els.focus();
    const before = await els.getAttribute('aria-valuetext');
    const last = (await els.getAttribute('aria-valuenow')) === (await els.getAttribute('aria-valuemax'));
    await tap(page, last ? BUTTON.left : BUTTON.right);
    await expect(els).not.toHaveAttribute('aria-valuetext', before!);
    expect(Math.min(toCard, toElements), 'the card and Elements are reachable').toBeGreaterThanOrEqual(0);
    const element = toCard + toElements + 1;
    if (process.env.NAV_REPORT) console.log(`PN07 (${test.info().project.name}): element ${element} (${toCard} + ${toElements} + 1)`);
    expect(element, `change an element: ${toCard} to the card, ${toElements} to Elements, 1 step`).toBeLessThanOrEqual(BUDGET);
    const was = JSON.stringify((await save()).equipped.weapon.moveset.chains.primary);
    await tap(page, BUTTON.y);
    await expect(page.getByTestId('apply-sheet-confirm')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(async () => JSON.stringify((await save()).equipped.weapon.moveset.chains.primary)).not.toBe(was);
  });
});
