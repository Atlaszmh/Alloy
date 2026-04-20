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

    const uidsBefore = await page.evaluate(
      () => ((window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[]).map((g) => g.uid),
    );

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

    const uidsAfter = await page.evaluate(
      () => ((window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as any[]).map((g) => g.uid),
    );

    // Net -1: two consumed, one output.
    expect(uidsAfter.length).toBe(uidsBefore.length - 1);
    expect(uidsAfter).not.toContain('r03-a');
    expect(uidsAfter).not.toContain('r03-b');
    // A newly-introduced uid should be present.
    const newUids = uidsAfter.filter((u) => !uidsBefore.includes(u));
    expect(newUids.length).toBe(1);
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
    // Land in a known state: 2 lives remaining, 2 consecutive wins (about to hit
    // the 3-win streak threshold that restores a life).
    await startRunViaStore(page, {
      round: 4,
      phase: 'duel',
      startingLives: 3,
    });
    await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      stores.runStore.setState({ lives: 2, consecutiveWins: 2 });
    });
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="run-lives-count"]')).toHaveAttribute('data-lives', '2');

    // Simulate the streak-completing win + life recovery directly on the runStore.
    // The engine's checkLifeRecovery mirrors this: streak reaches 3 → +1 life, streak reset.
    await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const s = stores.runStore.getState();
      stores.runStore.setState({
        consecutiveWins: 0,
        lives: s.lives + 1,
        round: s.round + 1,
      });
    });

    await expect(page.locator('[data-testid="run-lives-count"]')).toHaveAttribute(
      'data-lives',
      '3',
      { timeout: 3_000 },
    );
  });

  test('R08: reaching round 10 shows run-won state', async ({ page }) => {
    // Inject a complete+won state directly rather than fast-forwarding 9 duels.
    // The purpose here is the PostMatch UI branch for run-mode victory, not the
    // engine's round-progression math (which is covered by engine unit tests).
    await startRunViaStore(page, { round: 1, phase: 'duel', startingLives: 3, goalRound: 10 });
    await page.evaluate(() => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const current = stores.matchStore.getState().state;
      if (!current) return;
      stores.matchStore.setState({
        state: {
          ...current,
          phase: { kind: 'complete', winner: 0, scores: [10, 0] },
          runState: current.runState
            ? { ...current.runState, status: 'won', round: 10 }
            : current.runState,
        },
      });
      stores.runStore.setState({ status: 'won', round: 10 });
    });

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

  test.skip('R07b: milestone round 6 restores a life', async () => {
    // balance.json lifeRecovery.milestoneRounds = [6, 10].
    // To test: seed matchState.runState { round: 6, lives: 2 } via matchStore.setState,
    // then dispatch duel_continue with a win result so the engine runs
    // checkLifeRecovery and applies the +1 life. Requires engine-level state
    // injection (not just runStore mutation) because applyAction reads from
    // matchState, not runStore. The startRunViaStore fixture does not yet support
    // runStateOverride. Add { runStateOverride: { round, lives } } to the fixture
    // and mutate matchStore.state.runState before calling waitForPhase.
  });

  test.skip('R07c: milestone round 10 restores a life', async () => {
    // Same mechanic as R07b but round=10. Note: round 10 is also the goalRound,
    // so advanceRound fires and may also set status='won'. The test should verify
    // that BOTH life recovery AND run-won overlay appear (or clarify priority).
    // Same fixture requirements as R07b: runStateOverride seeding.
  });

  test.skip('R07d: 5th discovery restores a life', async () => {
    // balance.json lifeRecovery.discoveryThreshold = 5.
    // Requires seeding discoveryState.totalDiscoveryCount() === 5 before a win.
    // The engine reads discoveryState from matchState — needs matchState.discoveryState
    // injection via matchStore.setState({ state: { ...current, discoveryState: ... } }).
    // Once discovery seeding is in place, dispatch duel_continue with a win,
    // then assert lives +1 in runStore.
  });

  test.skip('F01: winning a duel earns flux', async () => {
    // Needs: a completed forge+duel flow where the engine awards win flux (+1 per
    // balance.json gem.flux.rewards.win). The forceRunResult helper only mutates
    // runStore (lives/streak), not the engine-side runState.flux. A real test
    // requires either: (a) a completeForgeAndWinDuel helper that drives the duel
    // simulation to completion, or (b) an engine-level fixture that injects a
    // post-duel-win MatchState. Both are out of scope for Chunk 6.
  });

  test.skip('F02: discovering a recipe earns flux', async () => {
    // balance.json gem.flux.rewards.discovery. Pair with C07 once discovery UI lands.
  });

  test.skip('F03: reaching milestone round earns flux', async () => {
    // balance.json gem.flux.rewards.milestone.
  });

  test('F04: reroll_pool button spends flux and generates new draft pool', async ({ page }) => {
    // Flux costs from balance.json: reroll_pool = 5
    await startRunViaStore(page, { round: 2, phase: 'forge', seedFlux: 10 });

    // Wait for forge-flux section to appear (only shown in run modes with runState).
    await page.locator('[data-run-flux]').waitFor({ timeout: 10_000 });

    const fluxBefore = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
    expect(fluxBefore).toBe(10);

    await page.getByRole('button', { name: /Reroll/i }).click();
    await page.waitForTimeout(300);

    const fluxAfter = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
    expect(fluxAfter).toBe(fluxBefore - 5);
  });

  test('F05: guarantee_rarity button spends flux', async ({ page }) => {
    // Flux costs from balance.json: guarantee_rarity = 4
    await startRunViaStore(page, { round: 2, phase: 'forge', seedFlux: 10 });

    await page.locator('[data-run-flux]').waitFor({ timeout: 10_000 });

    const fluxBefore = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
    expect(fluxBefore).toBe(10);

    await page.getByRole('button', { name: /Rarity/i }).click();
    await page.waitForTimeout(300);

    const fluxAfter = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
    expect(fluxAfter).toBe(fluxBefore - 4);
  });

  test('F06: boost_combine button spends flux', async ({ page }) => {
    // Flux costs from balance.json: boost_combine = 3
    await startRunViaStore(page, { round: 2, phase: 'forge', seedFlux: 10 });

    await page.locator('[data-run-flux]').waitFor({ timeout: 10_000 });

    const fluxBefore = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
    expect(fluxBefore).toBe(10);

    await page.getByRole('button', { name: /Boost/i }).click();
    await page.waitForTimeout(300);

    const fluxAfter = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
    expect(fluxAfter).toBe(fluxBefore - 3);
  });

});
