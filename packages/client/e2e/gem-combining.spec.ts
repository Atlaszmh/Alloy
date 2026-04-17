import { test, expect, type Page } from '@playwright/test';
import { startRunViaStore, setupForgeWithGems } from './fixtures/match';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

type Rarity = 'common' | 'uncommon' | 'magic' | 'rare' | 'epic' | 'legendary';

function makeGem(
  uid: string,
  affixId: string,
  opts: { tier?: 1 | 2 | 3 | 4 | 5; rarity?: Rarity; depth?: number; combinable?: boolean } = {},
) {
  const { tier = 1, rarity = 'common', depth = 0, combinable } = opts;
  return {
    uid,
    affixId,
    tier,
    rarity,
    recipeDepth: depth,
    combinable: combinable ?? depth < 3,
    tags: [affixId],
  };
}

async function placeInSlots(page: Page, uidA: string, uidB: string) {
  await page.evaluate(
    ({ uidA, uidB }) => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const state = stores.forgeStore.getState();
      const a = state.plan.stockpile.find((g: any) => g.uid === uidA);
      const b = state.plan.stockpile.find((g: any) => g.uid === uidB);
      state.setComboSlotByIndex(0, a);
      state.setComboSlotByIndex(1, b);
    },
    { uidA, uidB },
  );
  await page.waitForTimeout(300);
}

/* ------------------------------------------------------------------ */
/*  Gem Combining E2E tests                                            */
/*                                                                     */
/*  C01-C06 are wired. C03 (KEEP-slot mismatch) exercises the new      */
/*  slot-0 anchoring. C07 (discovery journal) remains skipped until    */
/*  the in-forge discovery UI is built.                                */
/* ------------------------------------------------------------------ */

test.describe('Gem Combining', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  });

  test('C01: select two gems to combine shows preview', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c01-a', 'fire_damage'),
      makeGem('c01-b', 'fire_damage'),
    ]);
    await placeInSlots(page, 'c01-a', 'c01-b');

    await expect(page.locator('[data-combine-result]')).toBeVisible();
    await expect(page.locator('[data-combine-btn]')).toBeEnabled();
  });

  test('C02: same-type combine produces a new gem via category fusion', async ({ page }) => {
    // Offensive-only pair hits the Offensive Fusion category recipe first
    // (layer order: signature → category → generic). Output carries the survivor's
    // affix/tier/rarity plus category outputBonusEffects at recipeDepth + 1.
    // If we later want common+common → uncommon for *same-affix* inputs, the
    // engine would need to short-circuit category matching for same-affix gems.
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c02-a', 'fire_damage', { rarity: 'common' }),
      makeGem('c02-b', 'fire_damage', { rarity: 'common' }),
    ]);

    const uidsBefore = await page.evaluate(
      () => ((window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[]).map((g) => g.uid),
    );

    await placeInSlots(page, 'c02-a', 'c02-b');
    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(500);

    const output = await page.evaluate((prevUids) => {
      const stockpile = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[];
      return stockpile.find((g) => !prevUids.includes(g.uid)) ?? null;
    }, uidsBefore);

    expect(output).not.toBeNull();
    expect(output.affixId).toBe('fire_damage');
    expect(output.recipeDepth).toBe(1);
    // Source gems removed from stockpile.
    const stillThere = await page.evaluate(() => {
      const stockpile = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[];
      return stockpile.some((g) => g.uid === 'c02-a' || g.uid === 'c02-b');
    });
    expect(stillThere).toBe(false);
  });

  test('C03: KEEP slot forwards slot-0 uid as keepGemUid in the combine action', async ({ page }) => {
    // Engine behavior (respecting keepGemUid) is pinned by
    // combination-engine.test.ts "respects keepGemUid when provided". This test
    // verifies the UI-to-engine wiring: whatever gem the player drops in slot 0
    // reaches the engine as keepGemUid.
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c03-keep', 'fire_damage', { tier: 2, rarity: 'common' }),
      makeGem('c03-other', 'cold_damage', { tier: 1, rarity: 'common' }),
    ]);
    await placeInSlots(page, 'c03-keep', 'c03-other');
    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(400);

    const logged = await page.evaluate(() => {
      const log = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.actionLog as any[];
      return log.filter((a) => a.kind === 'combine').slice(-1)[0] ?? null;
    });

    expect(logged).not.toBeNull();
    expect(logged.keepGemUid).toBe('c03-keep');
    expect(logged.gemUid1).toBe('c03-keep');
  });

  test('C03b: swapping slot 0 flips the forwarded keepGemUid', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c03b-cold-keep', 'cold_damage', { tier: 1, rarity: 'common' }),
      makeGem('c03b-fire-other', 'fire_damage', { tier: 2, rarity: 'common' }),
    ]);
    await placeInSlots(page, 'c03b-cold-keep', 'c03b-fire-other');
    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(400);

    const logged = await page.evaluate(() => {
      const log = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.actionLog as any[];
      return log.filter((a) => a.kind === 'combine').slice(-1)[0] ?? null;
    });

    expect(logged).not.toBeNull();
    // Slot-0 gem (cold_damage here) is the kept gem, regardless of which input
    // has higher effective value — proves it's the slot position, not an EV heuristic.
    expect(logged.keepGemUid).toBe('c03b-cold-keep');
  });

  test('C04: signature recipe produces unique gem with gold glow', async ({ page }) => {
    // ignite = chance_on_hit + fire_damage (signature recipe).
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c04-a', 'chance_on_hit'),
      makeGem('c04-b', 'fire_damage'),
    ]);

    const uidsBefore = await page.evaluate(
      () => ((window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[]).map((g) => g.uid),
    );

    await placeInSlots(page, 'c04-a', 'c04-b');

    // Gold glow signals a known recipe pair.
    await expect(page.locator('[data-combine-result][data-glow="gold"]')).toBeVisible({
      timeout: 3_000,
    });

    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(500);

    // Find the new gem and assert it carries a sourceRecipe identifier.
    const output = await page.evaluate((prevUids) => {
      const stockpile = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[];
      return stockpile.find((g) => !prevUids.includes(g.uid)) ?? null;
    }, uidsBefore);

    expect(output).not.toBeNull();
    expect(output.sourceRecipe).toBe('ignite');
  });

  test('C05: combined gem (depth 1) is still combinable', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c05-depth1', 'fire_damage', { tier: 2, rarity: 'uncommon', depth: 1 }),
      makeGem('c05-fresh', 'fire_damage', { tier: 2, rarity: 'uncommon', depth: 0 }),
    ]);

    await expect(
      page.locator('[data-gem-uid="c05-depth1"][data-combinable="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-gem-uid="c05-fresh"][data-combinable="true"]'),
    ).toBeVisible();
  });

  test('C06: max-depth gem is marked non-combinable', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c06-max', 'fire_damage', {
        tier: 5,
        rarity: 'legendary',
        depth: 3,
        combinable: false,
      }),
    ]);

    await expect(
      page.locator('[data-gem-uid="c06-max"][data-combinable="false"]'),
    ).toBeVisible();
  });

  test.skip('C07: discovery journal updates on new recipe', async () => {
    // Blocked: no in-forge discovery UI. Engine tracks discoveries, but the
    // client only surfaces them in PostMatch. Needs a discovery count badge
    // (or toast) in ForgeHeader before this can be wired.
  });

  test.skip('C08: same-affix combine should rarity-bump (common + common → uncommon)', async () => {
    // Blocked: the category fusion (Offensive Fusion / Defensive Fusion / etc.)
    // fires before genericSameType because every affix has a category with a
    // matching category recipe. As a result, same-affix common+common combines
    // currently produce a category-fusion output with unchanged rarity instead
    // of the rarity bump the design implies. To fix, the engine should either
    // short-circuit tryCategory when gemA.affixId === gemB.affixId, or
    // genericSameType needs to run before category fusion for same-affix pairs.
  });

  test('C09: 3-gem fallback consumes winning pair, leaves third in stockpile', async ({ page }) => {
    // (chance_on_hit + fire_damage) forms Ignite; cold_damage is unrelated → ejected.
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c09-keep', 'chance_on_hit'),
      makeGem('c09-pair', 'fire_damage'),
      makeGem('c09-eject', 'cold_damage'),
    ]);

    const uidsBefore = await page.evaluate(
      () => ((window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[]).map(g => g.uid),
    );

    await page.evaluate(
      ({ uidA, uidB, uidC }) => {
        const stores = (window as any).__ZUSTAND_STORES__;
        const state = stores.forgeStore.getState();
        const a = state.plan.stockpile.find((g: any) => g.uid === uidA);
        const b = state.plan.stockpile.find((g: any) => g.uid === uidB);
        const c = state.plan.stockpile.find((g: any) => g.uid === uidC);
        state.setComboSlotByIndex(0, a);
        state.setComboSlotByIndex(1, b);
        state.setComboSlotByIndex(2, c);
      },
      { uidA: 'c09-keep', uidB: 'c09-pair', uidC: 'c09-eject' },
    );
    await page.waitForTimeout(300);

    await expect(page.locator('[data-combine-btn]')).toBeEnabled();
    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(500);

    const output = await page.evaluate((prev) => {
      const stockpile = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[];
      return stockpile.find(g => !prev.includes(g.uid)) ?? null;
    }, uidsBefore);
    expect(output).not.toBeNull();
    expect(output.affixId).toBe('ignite');

    const state = await page.evaluate(() => {
      const stockpile = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[];
      return {
        hasKeep: stockpile.some(g => g.uid === 'c09-keep'),
        hasPair: stockpile.some(g => g.uid === 'c09-pair'),
        hasEject: stockpile.some(g => g.uid === 'c09-eject'),
      };
    });
    expect(state.hasKeep).toBe(false);
    expect(state.hasPair).toBe(false);
    expect(state.hasEject).toBe(true);
  });
});
