import { test, expect, type Page } from '@playwright/test';
import {
  beginFloor,
  completeFloor,
  createDefaultRegistry,
  createDelveProfile,
  movesetOf,
  runeText,
  startDive,
  stopKinds,
  type DataRegistry,
  type DelveProfile,
  type GearItem,
  type RuneRef,
} from '@alloy/engine';

/**
 * Runes (see the runes spec): a seeded save with sockets and a pouch; the Anvil's picker and
 * Apply, the HUD's pips in a dive, the stop's fifth kind, and fusing on the Forge tab.
 */

const SAVE_KEY = 'alloy:delve:v2';
/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;
const QUICK_III: RuneRef = { id: 'quick', tier: 3 };

/** `weapon` with its Primary's first move holding `runes` (one entry per open socket). */
function socketed(registry: DataRegistry, weapon: GearItem, runes: (RuneRef | null)[]): GearItem {
  const moveset = movesetOf(registry, weapon);
  const primary = moveset.chains.primary!;
  const moves = primary.moves.map((m, i) => (i === 0 ? { ...m, runes } : m));
  return {
    ...weapon,
    moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
  };
}

/** A fire hero (seed 4242), its starting sword's Primary move holding `runes`, `over` on top. */
function heroWith(
  registry: DataRegistry,
  runes: (RuneRef | null)[],
  over: Partial<DelveProfile> = {},
): DelveProfile {
  const profile = createDelveProfile(registry, 4242, { primary: 'fire' });
  const weapon = socketed(registry, profile.equipped.weapon!, runes);
  return { ...profile, equipped: { ...profile.equipped, weapon }, ...over };
}

/** Seed `profile` as the save, the bot playing the arena if `autopilot`. */
async function seed(page: Page, profile: DelveProfile, autopilot = false): Promise<void> {
  await page.addInitScript(
    ([key, value, bot]) => {
      if (sessionStorage.getItem('runes-e2e')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      if (bot) localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:delve:timescale', '2');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('runes-e2e', '1');
    },
    [SAVE_KEY, JSON.stringify(profile), autopilot] as const,
  );
}

/** The saved profile, as the store wrote it. */
function saved(page: Page): Promise<DelveProfile> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}

/** The saved Primary's first move's sockets. */
async function primarySockets(page: Page): Promise<(RuneRef | null)[] | undefined> {
  const p = await saved(page);
  return p.equipped.weapon!.moveset!.chains.primary!.moves[0].runes;
}

test.describe('Delve runes', () => {
  test('R01: open a socket and socket a pouch rune at the Anvil, applied as one draft', async ({
    page,
  }) => {
    const registry = createDefaultRegistry();
    // No socket yet; a Link and 20 scrap pay for the first; Quick III waits in the pouch.
    await seed(
      page,
      heroWith(registry, [], { links: 1, scrap: 20, runes: { quick: [0, 0, 1, 0, 0] } }),
    );
    await page.goto('/delve');
    await page.getByTestId('tab-abilities').click();
    const cards = page.getByTestId('chain-cards');
    await expect(cards.getByTestId('socket-0')).toHaveCount(0);
    await cards.getByTestId('socket-open').click();
    await cards.getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker).toBeVisible();
    // The picker names the rune at its tier with its effect, as the engine's runeText fills it.
    const quick = picker.getByTestId('rune-pick-quick');
    await expect(quick).toContainText('Quick');
    await expect(quick).toContainText('III');
    await expect(quick).toContainText(runeText(registry, QUICK_III, { form: 'bolt' }).effect);
    await quick.click();
    await expect(picker).toBeHidden();
    await expect(cards.getByTestId('socket-0')).toHaveAttribute('data-rune', 'quick:3');
    // Still a draft: the save is untouched until Apply, whose label holds the socket's price.
    expect((await primarySockets(page)) ?? []).toEqual([]);
    const apply = page.getByTestId('chain-apply');
    await expect(apply).toContainText('🔗 1');
    await expect(apply).toContainText('⚙ 20');
    await apply.click();
    await expect(page.getByTestId('chain-draft')).toHaveCount(0);
    await expect.poll(() => primarySockets(page)).toEqual([QUICK_III]);
    const after = await saved(page);
    expect(after.links).toBe(0);
    expect(after.scrap).toBe(0);
    expect(after.runes.quick).toEqual([0, 0, 0, 0, 0]);
    // A filled socket shows its rune with Pull, which destroys it as shipped.
    await cards.getByTestId('socket-0').click();
    await expect(picker.getByTestId('rune-pull')).toContainText('destroys');
    await picker.getByTestId('rune-picker-close').click();
    await expect(picker).toBeHidden();
  });

  test('R02: a socketed rune shows as a pip on its ability button in a dive', async ({ page }) => {
    const registry = createDefaultRegistry();
    await seed(page, heroWith(registry, [QUICK_III]), true);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const primary = page.getByTestId('ability-0');
    await expect(primary).toBeVisible({ timeout: ARENA_READY });
    // One dot for Quick (the HUD's pips carry their rune's id as `data-rune`).
    const pips = primary.locator('[data-rune]');
    await expect(pips).toHaveCount(1);
    await expect(pips).toHaveAttribute('data-rune', 'quick');
  });

  test("R03: the stop's fifth power-up sockets a pouch rune mid-dive", async ({ page }) => {
    const registry = createDefaultRegistry();
    // An open empty socket and a fitting pouch rune, and nothing else to take: no bag, scrap,
    // Links or Mana Dust. Its first depth is cleared, so it waits at the door screen.
    let profile = heroWith(registry, [null], {
      runes: { quick: [0, 0, 1, 0, 0] },
      bag: [],
      scrap: 0,
      links: 0,
      manaDust: 0,
    });
    profile = startDive(registry, profile, 1);
    profile = completeFloor(registry, profile, beginFloor(registry, profile)).profile;
    expect(stopKinds(registry, profile)).toEqual(['rune']);
    expect(profile.dive!.stop!.offers).toEqual(['rune']);
    await seed(page, profile);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: ARENA_READY });
    await page.getByTestId('stop-rune').click();
    const stopPicker = page.getByTestId('stop-picker');
    await expect(stopPicker).toBeVisible();
    await stopPicker.getByTestId('stop-rune-move-primary-0').getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker).toBeVisible();
    await picker.getByTestId('rune-pick-quick').click();
    await expect(page.getByTestId('stop-taken')).toBeVisible();
    await expect.poll(() => primarySockets(page)).toEqual([QUICK_III]);
    expect((await saved(page)).runes.quick).toEqual([0, 0, 0, 0, 0]);
  });

  test('R04: three of a rune fuse into one of the next tier on the Forge tab', async ({ page }) => {
    const registry = createDefaultRegistry();
    await seed(page, heroWith(registry, [], { scrap: 20, runes: { split: [3, 0, 0, 0, 0] } }));
    await page.goto('/delve');
    await page.getByTestId('tab-forge').click();
    const pouch = page.getByTestId('rune-pouch');
    await expect(pouch).toBeVisible();
    await pouch.getByTestId('rune-fuse-split-1').click();
    await expect(pouch.getByTestId('pouch-split-2')).toBeVisible();
    await expect(pouch.getByTestId('pouch-split-1')).toHaveCount(0);
    await expect(page.getByTestId('scrap-count')).toHaveText('⚙ 0 scrap');
    await expect.poll(async () => (await saved(page)).runes.split).toEqual([0, 1, 0, 0, 0]);
  });
});
