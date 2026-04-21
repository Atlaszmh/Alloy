import { test, expect } from '@playwright/test';
import { startRunViaStore } from './fixtures/match';

/**
 * Smoke test for the desktop HUD forge layout. Asserts that socketing a
 * stockpile gem updates the weapon `SocketedAffixList` (Chunk 5.4 of the
 * 2026-04-20 Forge HUD Desktop plan).
 *
 * Gem placement drives `forgeStore.applyAction({ kind: 'socket_gem', ... })`
 * directly — the same pattern run-flow.spec.ts uses. Click-based socketing
 * hits a React state-update / closure timing issue inside a single
 * page.evaluate call; the store-action path is reliable.
 */
test('desktop HUD: sockets a gem and affix list updates', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await startRunViaStore(page, { round: 1, phase: 'forge' });
  await page.waitForSelector('[data-screen="forge-desktop"]', { timeout: 5_000 });

  const weaponAffixList = page.locator(
    '[data-screen="forge-desktop"] [data-socketed-affix-list="weapon"]',
  );
  await expect(weaponAffixList).toBeVisible();

  // Baseline: fresh forge round has every row flagged data-empty="true".
  const baselineEmptyCount = await weaponAffixList
    .locator('[data-testid="affix-row"][data-empty="true"]')
    .count();
  expect(baselineEmptyCount).toBeGreaterThan(0);

  // Grab the first stockpile gem uid.
  const firstGem = page.locator('[data-stockpile-cell] [data-gem-uid]').first();
  await expect(firstGem).toBeVisible();
  const uid = await firstGem.getAttribute('data-gem-uid');
  expect(uid).toBeTruthy();

  // Socket via forgeStore dispatch (reliable — mirrors run-flow.spec.ts).
  await page.evaluate((gemUid) => {
    const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => unknown }> }).__ZUSTAND_STORES__;
    const forge = stores.forgeStore.getState() as {
      applyAction: (a: unknown, r: unknown) => { ok: boolean };
    };
    const match = stores.matchStore.getState() as { getRegistry: () => unknown };
    forge.applyAction(
      { kind: 'socket_gem', gemUid, target: 'weapon', slotIndex: 0 },
      match.getRegistry(),
    );
  }, uid);

  await expect(
    weaponAffixList.locator('[data-testid="affix-row"]').first(),
  ).toHaveAttribute('data-empty', 'false', { timeout: 3_000 });
});
