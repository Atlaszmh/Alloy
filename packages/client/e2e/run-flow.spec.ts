import { test, expect, type Page } from '@playwright/test';
import {
  startRun,
  startRunViaStore,
  forceRunResult,
  completeDraft,
  setupForgeWithGems,
} from './fixtures/match';

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

async function getStockpileUids(page: Page): Promise<string[]> {
  return page.locator('[data-gem-tray] [data-gem-uid]').evaluateAll(
    els => els.map(e => e.getAttribute('data-gem-uid') ?? ''),
  );
}

/* ------------------------------------------------------------------ */
/*  Run flow E2E tests                                                 */
/*                                                                     */
/*  Covers R01-R10 from the run-loop acceptance set. R09 (endless      */
/*  mode) remains skipped pending engine + UI work.                    */
/* ------------------------------------------------------------------ */

test.describe('Run Flow', () => {
  // Run on desktop only — the flows rely on frame-relative sizing hooks.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  });

  test('R01: start run shows weapon/armor selection in first forge', async ({ page }) => {
    await startRun(page);
    await completeDraft(page);

    await expect(page.getByText(/Choose your weapon/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Random/i }).click();

    await expect(page.getByText(/Choose your armor/i)).toBeVisible({ timeout: 5_000 });
  });

  test('R02: round 1 draft pool has common or uncommon rarity only', async ({ page }) => {
    await startRun(page);
    await expect(page.locator('[data-gem]').first()).toBeVisible({ timeout: 10_000 });

    const rarities = await page.locator('[data-gem]').evaluateAll(
      els => els.map(e => e.getAttribute('data-gem-rarity')),
    );
    expect(rarities.length).toBeGreaterThan(0);
    for (const r of rarities) {
      expect(['common', 'uncommon']).toContain(r);
    }
  });

  test('R03: combine two gems produces result in stockpile', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });

    const a = makeGem('r03-a', 'fire_damage');
    const b = makeGem('r03-b', 'fire_damage');
    await setupForgeWithGems(page, [a, b]);

    const before = await getStockpileUids(page);

    await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const state = stores.forgeStore.getState();
      const gemA = state.plan.stockpile.find((g: any) => g.uid === 'r03-a');
      const gemB = state.plan.stockpile.find((g: any) => g.uid === 'r03-b');
      state.setComboSlotByIndex(0, gemA);
      state.setComboSlotByIndex(1, gemB);
    });
    await page.waitForTimeout(300);

    await page.locator('[data-combine-btn]').click();
    await page.waitForTimeout(600);

    const after = await getStockpileUids(page);
    // Two consumed (a, b), one new output: net -1.
    expect(after.length).toBe(before.length - 1);
    expect(after).not.toContain('r03-a');
    expect(after).not.toContain('r03-b');
  });

  test('R04: socket and unsocket gems freely', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    const gem = makeGem('r04-socket', 'fire_damage');
    await setupForgeWithGems(page, [gem]);

    // Socket via forgeStore dispatch
    await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const forge = stores.forgeStore.getState();
      const registry = stores.matchStore.getState().getRegistry();
      forge.applyAction(
        { kind: 'socket_gem', gemUid: 'r04-socket', target: 'weapon', slotIndex: 0 },
        registry,
      );
    });
    await page.waitForTimeout(300);

    await expect(
      page.locator('[data-item-card="weapon"] [data-forge-socket="0"] [data-gem-uid="r04-socket"]'),
    ).toBeVisible({ timeout: 3_000 });

    // Unsocket
    await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const forge = stores.forgeStore.getState();
      const registry = stores.matchStore.getState().getRegistry();
      forge.applyAction(
        { kind: 'unsocket_gem', target: 'weapon', slotIndex: 0 },
        registry,
      );
    });
    await page.waitForTimeout(300);

    await expect(
      page.locator('[data-item-card="weapon"] [data-forge-socket="0"] [data-gem-uid="r04-socket"]'),
    ).not.toBeVisible();
  });

  test('R05: losing duel decrements life counter', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'duel', startingLives: 3 });

    const livesBefore = Number(
      await page.locator('[data-testid="run-lives-count"]').getAttribute('data-lives'),
    );
    expect(livesBefore).toBe(3);

    await forceRunResult(page, 'loss');

    await expect(page.locator('[data-testid="run-lives-count"]')).toHaveAttribute(
      'data-lives',
      String(livesBefore - 1),
      { timeout: 3_000 },
    );
  });

  test('R06: losing all lives shows run-over overlay', async ({ page }) => {
    await startRunViaStore(page, { round: 1, phase: 'duel', startingLives: 1 });
    await forceRunResult(page, 'loss');

    await expect(page.locator('[data-testid="run-status-overlay"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Run Over/i)).toBeVisible();
  });

  test('R07: win streak restores a life', async ({ page }) => {
    // Start with 2 consecutive wins + 2 remaining lives, then win again to trigger recovery.
    await startRunViaStore(page, {
      round: 4,
      phase: 'duel',
      startingLives: 3,
      consecutiveWins: 2,
    });

    // forceRunResult('win') simulates a 3rd consecutive win — runStore caps at startingLives.
    await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      stores.runStore.setState({ lives: 2 });
    });
    await page.waitForTimeout(200);

    const livesBefore = Number(
      await page.locator('[data-testid="run-lives-count"]').getAttribute('data-lives'),
    );
    await forceRunResult(page, 'win');
    const livesAfter = Number(
      await page.locator('[data-testid="run-lives-count"]').getAttribute('data-lives'),
    );
    expect(livesAfter).toBe(livesBefore + 1);
  });

  test('R08: reaching round 10 shows run-won state', async ({ page }) => {
    test.slow(); // debug match fast-forwards prior rounds via the engine.
    await startRunViaStore(page, { round: 10, phase: 'duel', startingLives: 3, goalRound: 10 });
    await forceRunResult(page, 'win');

    await expect(page.locator('[data-testid="run-won-heading"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/RUN WON/i)).toBeVisible();
  });

  test.skip('R09: round 11 enters endless mode', async () => {
    // Blocked: phase-machine.ts:97-102 currently completes the run at goal.
    // Needs engine path for post-goal endless + "Continue Endless" UI.
  });

  test('R10: later rounds show higher quality gems in draft', async ({ page }) => {
    test.slow(); // debug match fast-forwards 6 prior rounds.
    await startRunViaStore(page, { round: 7, phase: 'draft' });
    await expect(page.locator('[data-gem]').first()).toBeVisible({ timeout: 15_000 });

    const rarities = await page.locator('[data-gem]').evaluateAll(
      els => els.map(e => e.getAttribute('data-gem-rarity')),
    );
    expect(rarities.length).toBeGreaterThan(0);
    const hasHighQuality = rarities.some(r => ['rare', 'epic', 'legendary'].includes(r ?? ''));
    expect(hasHighQuality).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /*  Phase 6 — Placeholder tests for audit-surfaced gaps               */
  /*                                                                    */
  /*  These cover features present in the engine but not yet wired by  */
  /*  the UI or not yet tested. Left as test.skip until the underlying  */
  /*  UI/flux affordances are ready.                                    */
  /* ---------------------------------------------------------------- */

  test.skip('R07b: milestone round 5 restores a life', async () => {
    // run-state.ts checkLifeRecovery: milestoneRounds [5, 10] recover 1 life.
    // Needs a deterministic way to reach round 5 with reduced lives.
  });

  test.skip('R07c: milestone round 10 restores a life', async () => {
    // Same mechanic, round 10. Overlaps with R08 (goal) — consider whether
    // both should fire or only one.
  });

  test.skip('R07d: 5th discovery restores a life', async () => {
    // run-state.ts checkLifeRecovery: discoveryThreshold=5. Requires seeding
    // discoveryState with 5 recipes via matchStore, then triggering recovery.
  });

  test.skip('F01: winning a duel earns flux', async () => {
    // balance.json gem.flux.rewards.win +1. Needs ForgeHeader flux display
    // hook (data-run-flux) to read the value without evaluate.
  });

  test.skip('F02: discovering a recipe earns flux', async () => {
    // balance.json gem.flux.rewards.discovery. Pair with C07 once discovery UI lands.
  });

  test.skip('F03: reaching milestone round earns flux', async () => {
    // balance.json gem.flux.rewards.milestone.
  });

  test.skip('F04: reroll_pool button spends flux and generates new draft pool', async () => {
    // Blocked: no reroll UI yet. Engine action exists.
  });

  test.skip('F05: guarantee_rarity button spends flux and seeds rare+ gem', async () => {
    // Blocked: no guarantee_rarity UI yet. Engine action exists.
  });

  test.skip('F06: boost_combine button spends flux and upgrades next combine', async () => {
    // Blocked: no boost_combine UI yet. Engine action exists.
  });

});
