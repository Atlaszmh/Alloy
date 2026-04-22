import { test, expect } from '@playwright/test';
import { startRunViaStore, setupForgeWithGems } from './fixtures/match';

/**
 * T5 Rare gem: tier(5) + rarityIndex('rare'=3) = 8 >= unlockThreshold(6)
 * → has secondary slot, no existing secondary → valid transplant host.
 */
function makeHostGem(uid: string) {
  return {
    uid,
    affixId: 'fire_damage',
    tier: 5,
    rarity: 'rare',
    recipeDepth: 0,
    combinable: true,
    tags: ['fire_damage'],
  };
}

/**
 * T2 Magic gem: tier(2) + rarityIndex('magic'=2) = 4 < 6
 * → no secondary slot → valid transplant source (primary affix only).
 */
function makeDonorGem(uid: string) {
  return {
    uid,
    affixId: 'cold_damage',
    tier: 2,
    rarity: 'magic',
    recipeDepth: 0,
    combinable: true,
    tags: ['cold_damage'],
  };
}

/** Place two gems into workbench slots 0 and 1 via the store. */
async function placeInTransplantSlots(
  page: import('@playwright/test').Page,
  hostUid: string,
  donorUid: string,
) {
  await page.evaluate(
    ({ hostUid, donorUid }) => {
      const stores = (window as any).__ZUSTAND_STORES__;
      const state = stores.forgeStore.getState();
      const host = state.plan.stockpile.find((g: any) => g.uid === hostUid);
      const donor = state.plan.stockpile.find((g: any) => g.uid === donorUid);
      // Slot 0 = host (KEEP), slot 1 = source/donor
      state.setComboSlotByIndex(0, host);
      state.setComboSlotByIndex(1, donor);
    },
    { hostUid, donorUid },
  );
  // Give the transplantPreview effect a tick to compute
  await page.waitForTimeout(400);
}

test.describe('Forge — transplant happy path', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  });

  test('TR01: unlock secondary slot, transplant via random mode, verify pip updates', async ({ page }) => {
    // 1. Boot into the forge phase via the store shortcut (bypasses UI flow).
    await startRunViaStore(page, { round: 1, phase: 'forge' });

    // 2. Inject a transplant-eligible host (T5 Rare) and a donor (T2 Magic).
    await setupForgeWithGems(page, [makeHostGem('tr01-host'), makeDonorGem('tr01-donor')]);

    // 3. Verify the T5 Rare gem shows the open-empty pip in the stockpile strip.
    await expect(
      page.locator('[data-testid="gem-secondary-slot-open"][data-gem-uid="tr01-host"]'),
    ).toBeVisible({ timeout: 3_000 });

    // 4. Stage both gems into the workbench slots.
    await placeInTransplantSlots(page, 'tr01-host', 'tr01-donor');

    // 5. Verify the Transplant button is enabled (transplantPreview is non-null).
    await expect(page.getByTestId('workbench-transplant-button')).toBeEnabled({ timeout: 3_000 });

    // 6. Click Transplant (random mode — chosenAffix is null → no flux cost).
    await page.getByTestId('workbench-transplant-button').click();
    await page.waitForTimeout(500);

    // 7. Verify the donor gem was consumed (no longer in the stockpile).
    // The engine uses a SlotArray that can contain null entries after clearSlot,
    // so we guard against nulls before reading .uid.
    const donorStillPresent = await page.evaluate(() => {
      const stockpile = (window as any).__ZUSTAND_STORES__.forgeStore.getState().plan.stockpile as (any | null)[];
      return stockpile.some((g) => g != null && g.uid === 'tr01-donor');
    });
    expect(donorStillPresent).toBe(false);

    // 8. Verify the host now shows a filled pip (secondary slot populated).
    await expect(
      page.locator('[data-testid="gem-secondary-slot-filled"][data-gem-uid="tr01-host"]'),
    ).toBeVisible({ timeout: 3_000 });

    // 9. (Optional) Verify the filled pip's affix matches the donor's primary affix.
    const filledAffix = await page
      .locator('[data-testid="gem-secondary-slot-filled"][data-gem-uid="tr01-host"]')
      .getAttribute('data-secondary-affix');
    expect(filledAffix).toBe('cold_damage');
  });
});
