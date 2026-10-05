import { test, expect, type Page } from '@playwright/test';
import { armed, startDive as departAndDelve } from './fixtures/delve';
import {
  baseCost,
  beginFloor,
  completeFloor,
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  loadText,
  manaPool,
  manaSupport,
  movesetOf,
  profileStats,
  resolveChain,
  runeText,
  startDive,
  stopKinds,
  type Chain,
  type DataRegistry,
  type DelveProfile,
  type GearItem,
  type RuneRef,
} from '@alloy/engine';

/**
 * Runes (see the runes spec): a seeded save with sockets and a pouch; the Anvil's picker and
 * Apply, the HUD's pips in a dive, the stop's fifth kind, and fusing on the Forge tab. Their
 * costs (the rune costs spec): the builder's prices, easing and mana support, the pool's
 * warning, and the DPS Lab's Mana select.
 */

const SAVE_KEY = 'alloy:delve:v2';
/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;
const QUICK_III: RuneRef = { id: 'quick', tier: 3 };
const ECHO_III: RuneRef = { id: 'echo', tier: 3 };
/** The DPS Lab's first rows: its worker loads the engine, slowly when many browsers run at once. */
const LAB_READY = 30_000;

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

/** A fire hero (seed 4242) armed (`armed`), its sword's Primary move holding `runes`, `over` on top. */
function heroWith(
  registry: DataRegistry,
  runes: (RuneRef | null)[],
  over: Partial<DelveProfile> = {},
): DelveProfile {
  const profile = armed(registry, createDelveProfile(registry, 4242, { primary: 'fire' }));
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
    await page.getByTestId('tab-skills').click();
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
    await expect(apply).toContainText('1 Link');
    await expect(apply).toContainText('20 scrap');
    await apply.click();
    await expect(page.getByTestId('chain-price')).toHaveText('No changes');
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
    await departAndDelve(page);
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
    await departAndDelve(page);

    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: ARENA_READY });
    await page.getByTestId('stop-rune').click();
    const stopPicker = page.getByTestId('stop').getByTestId('stop-picker');
    await expect(stopPicker).toBeVisible();
    await stopPicker.getByTestId('stop-rune-move-primary-0').getByTestId('socket-0').click();
    const picker = stopPicker.getByTestId('rune-picker');
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
    await expect(page.getByTestId('scrap-count')).toHaveText('0 scrap');
    await expect.poll(async () => (await saved(page)).runes.split).toEqual([0, 1, 0, 0, 0]);
  });

  test('R05: the builder prices a rune, eases it by attunement and shows the mana support', async ({
    page,
  }) => {
    const registry = createDefaultRegistry();
    // Echo III on the starting sword's Fire Bolt (Fire attunement 2); Quick III in the pouch.
    const profile = heroWith(registry, [ECHO_III], { runes: { quick: [0, 0, 1, 0, 0] } });
    const stats = profileStats(registry, profile);
    const chain = movesetOf(registry, profile.equipped.weapon!).chains.primary!;
    const resolved = resolveChain(registry, stats, 'primary', chain);
    const bolt = resolved.moves[0];
    // The loads are on and the hero's attunement eases them: else this test shows nothing.
    expect(bolt.payment).toBe('mana');
    expect(bolt.load).toBeGreaterThan(0);
    expect(bolt.ease).toBeGreaterThan(0);
    const terms = { payment: bolt.payment, ease: bolt.ease };
    const support = manaSupport(registry, stats, resolved);
    await seed(page, profile);
    await page.goto('/delve');
    await page.getByTestId('tab-skills').click();

    // The move's readout: its loaded cost, the runes' share of it, and what attunement takes off.
    const readout = page.getByTestId('ability-readout');
    await expect(readout).toContainText(`${Math.round(bolt.cost)} mana`);
    await expect(readout).toContainText(`(runes: ${loadText(registry, bolt.load, 'mana')})`);
    await expect(readout.getByTestId('rune-ease')).toHaveText(
      `Attunement eases rune cost by ${Math.round(bolt.ease * 100)}%`,
    );
    // The chain's spend against the build's refill, as the engine counts them.
    await expect(page.getByTestId('mana-support')).toHaveText(
      `Spends ${Math.round(support.spend)}/s · your build refills ${Math.round(support.refill)}/s`,
    );

    // The picker: the socketed rune's price and a candidate's, eased as the move is.
    await page.getByTestId('chain-cards').getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker.getByTestId('rune-current')).toContainText(
      runeText(registry, ECHO_III, { form: 'bolt' }, terms).cost!,
    );
    await expect(picker.getByTestId('rune-pick-quick')).toContainText(
      runeText(registry, QUICK_III, { form: 'bolt' }, terms).cost!,
    );
    await picker.getByTestId('rune-picker-close').click();
    await expect(picker).toBeHidden();

    // The pouch: a rune's raw price, with no move to ease it.
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('pouch-quick-3')).toContainText(
      runeText(registry, QUICK_III).cost!,
    );
  });

  test("R06: a runed mana move the pool can't hold is flagged in the builder", async ({ page }) => {
    const registry = createDefaultRegistry();
    // An epic sword carries an Ultimate: a medium Fire Nova paid with mana, Echo III socketed.
    const base = createDelveProfile(registry, 4242, { primary: 'fire' });
    const sword: GearItem = { ...base.equipped.weapon!, rarity: 'epic' };
    const moveset = defaultMoveset(registry, sword, 'fire');
    const ultimate: Chain = {
      moves: [{ kind: 'medium', form: 'nova', elements: ['fire'], runes: [ECHO_III] }],
      payment: 'mana',
    };
    const weapon = { ...sword, moveset: { ...moveset, chains: { ...moveset.chains, ultimate } } };
    const profile: DelveProfile = { ...base, equipped: { ...base.equipped, weapon } };
    const stats = profileStats(registry, profile);
    const pool = manaPool(stats, registry).max;
    const nova = resolveChain(registry, stats, 'ultimate', ultimate).moves[0];
    // Only the runes' load puts it past the pool.
    expect(baseCost(nova)).toBeLessThanOrEqual(pool);
    expect(nova.cost).toBeGreaterThan(pool);
    await seed(page, profile);
    await page.goto('/delve');
    await page.getByTestId('tab-skills').click();
    await page.getByTestId('chain-skill-ultimate').click();
    await expect(page.getByTestId('cost-warning')).toHaveText(
      `Needs ${Math.round(nova.cost)} mana; your pool holds ${Math.round(pool)}.`,
    );
  });

  test('R07: the DPS Lab runs its grid starved and supported (dev builds)', async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().startsWith('DPS Lab worker')) failures.push(m.text());
    });
    await page.goto('/delve/lab');
    const mana = page.getByTestId('lab-mana');
    await expect(mana).toHaveValue('full');
    await expect(page.getByTestId('lab-row').first()).toBeVisible({ timeout: LAB_READY });
    for (const sustained of ['starved', 'supported']) {
      await mana.selectOption(sustained);
      await expect(mana).toHaveValue(sustained);
      // A fresh run under the option: the progress bar is back, and its rows fill the table.
      await expect(page.getByTestId('lab-progress')).toBeVisible();
      await expect(page.getByTestId('lab-row').first()).toBeVisible({ timeout: LAB_READY });
    }
    expect(failures).toEqual([]);
  });
});
