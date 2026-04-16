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

  test('C02: same-type combine produces an uncommon gem', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c02-a', 'fire_damage', { rarity: 'common' }),
      makeGem('c02-b', 'fire_damage', { rarity: 'common' }),
    ]);
    await placeInSlots(page, 'c02-a', 'c02-b');
    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(500);

    // Output gem exists somewhere in the tray with uncommon rarity.
    const uncommon = page.locator('[data-gem-tray] [data-gem-rarity="uncommon"]');
    await expect(uncommon.first()).toBeVisible({ timeout: 3_000 });
  });

  test('C03: KEEP slot determines which gem is upgraded on mismatch', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c03-keep', 'fire_damage', { tier: 2, rarity: 'common' }),
      makeGem('c03-other', 'cold_damage', { tier: 1, rarity: 'common' }),
    ]);
    await placeInSlots(page, 'c03-keep', 'c03-other');
    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(500);

    // Verify the output carries the KEEP gem's affix and is bumped by one tier.
    const output = await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const stockpile = stores.forgeStore.getState().plan.stockpile as any[];
      const keepUids = new Set(['c03-keep', 'c03-other']);
      return stockpile.find((g) => !keepUids.has(g.uid)) ?? null;
    });

    expect(output).not.toBeNull();
    expect(output.affixId).toBe('fire_damage');
    expect(output.tier).toBe(3);
  });

  test('C03b: swapping slot 0 swaps which gem survives', async ({ page }) => {
    // Reverse of C03: put the cold gem in slot 0 (KEEP), fire in slot 1.
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c03b-cold-keep', 'cold_damage', { tier: 1, rarity: 'common' }),
      makeGem('c03b-fire-other', 'fire_damage', { tier: 2, rarity: 'common' }),
    ]);
    await placeInSlots(page, 'c03b-cold-keep', 'c03b-fire-other');
    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(500);

    const output = await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const stockpile = stores.forgeStore.getState().plan.stockpile as any[];
      const knownUids = new Set(['c03b-cold-keep', 'c03b-fire-other']);
      return stockpile.find((g) => !knownUids.has(g.uid)) ?? null;
    });

    expect(output).not.toBeNull();
    // Despite fire being the higher-EV gem, slot 0 (cold) is the one upgraded.
    expect(output.affixId).toBe('cold_damage');
    expect(output.tier).toBe(2);
  });

  test('C04: signature recipe produces unique gem with gold glow', async ({ page }) => {
    // ignite = chance_on_hit + fire_damage (signature recipe).
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await setupForgeWithGems(page, [
      makeGem('c04-a', 'chance_on_hit'),
      makeGem('c04-b', 'fire_damage'),
    ]);
    await placeInSlots(page, 'c04-a', 'c04-b');

    // Gold glow signals a known recipe pair.
    await expect(page.locator('[data-combine-result][data-glow="gold"]')).toBeVisible({
      timeout: 3_000,
    });

    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(500);

    // Output gem in tray carries a sourceRecipe identifier.
    const recipeGem = page.locator(
      '[data-gem-tray] [data-gem-source-recipe]:not([data-gem-source-recipe=""])',
    );
    await expect(recipeGem.first()).toBeVisible({ timeout: 3_000 });
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
});
