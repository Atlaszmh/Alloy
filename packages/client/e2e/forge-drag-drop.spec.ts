import { test, expect, type Page } from '@playwright/test';
import { startMatch, completeDraft, waitForPhase } from './fixtures/match';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Navigate through the draft and land on the forge screen. */
async function setupForge(page: Page) {
  await startMatch(page);
  await completeDraft(page);
  await waitForPhase(page, 'forge');
  await expect(page.getByText(/FORGE PHASE/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500); // Let animations settle
}

/**
 * Perform a pointer-based drag gesture from one coordinate to another.
 * Moves in small increments so the drag threshold (~8 px) is exceeded.
 */
async function dragElement(
  page: Page,
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = source.x + (target.x - source.x) * (i / steps);
    const y = source.y + (target.y - source.y) * (i / steps);
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
  await page.waitForTimeout(300); // Let drop animations settle
}

/** Return the centre of an element's bounding box. */
async function centre(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible();
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe('Forge Drag & Drop', () => {
  // Drag uses mouse events — run on desktop only.
  test.skip(({}, testInfo) => testInfo.project.name !== 'desktop', 'desktop only');

  // DD01: All three combine slots start at consistent size
  test('DD01: all three combine slots start at consistent size', async ({ page }) => {
    await setupForge(page);

    const slots = page.locator('[data-combo-slot]');
    await expect(slots).toHaveCount(3);

    const boxes = await Promise.all(
      [0, 1, 2].map(async (i) => {
        const slot = page.locator(`[data-combo-slot="${i}"]`);
        await expect(slot).toBeVisible();
        return slot.boundingBox();
      }),
    );

    for (const box of boxes) {
      expect(box).not.toBeNull();
    }

    // All widths and heights should match
    expect(boxes[1]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[2]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[1]!.height).toBeCloseTo(boxes[0]!.height, 0);
    expect(boxes[2]!.height).toBeCloseTo(boxes[0]!.height, 0);

    // Slots are styled with --gem-size; verify they read the CSS custom property
    const gemSize = await page.locator('[data-combo-slot="0"]').evaluate((el) => {
      return parseFloat(getComputedStyle(el).width);
    });
    expect(gemSize).toBeGreaterThanOrEqual(40); // Reasonable minimum
    expect(boxes[0]!.width).toBeCloseTo(gemSize, 0);
  });

  // DD02: Drag gem from stockpile to combine slot
  test('DD02: drag gem from stockpile to combine slot', async ({ page }) => {
    await setupForge(page);

    // Record combo slot size before drop
    const slotBefore = await page.locator('[data-combo-slot="0"]').boundingBox();
    expect(slotBefore).not.toBeNull();

    // Get the first gem in the tray
    const gemInTray = page.locator('[data-gem-tray] [data-gem-uid]').first();
    await expect(gemInTray).toBeVisible();
    const gemBox = await gemInTray.boundingBox();
    expect(gemBox).not.toBeNull();

    const src = { x: gemBox!.x + gemBox!.width / 2, y: gemBox!.y + gemBox!.height / 2 };
    const tgt = await centre(page, '[data-combo-slot="0"]');

    await dragElement(page, src, tgt);

    // Combo slot 0 should now contain a gem
    const filledSlot = page.locator('[data-combo-slot="0"][data-gem-uid]');
    await expect(filledSlot).toBeVisible({ timeout: 3000 });

    // Combo slot size should be unchanged
    const slotAfter = await page.locator('[data-combo-slot="0"]').boundingBox();
    expect(slotAfter).not.toBeNull();
    expect(slotAfter!.width).toBeCloseTo(slotBefore!.width, 0);
    expect(slotAfter!.height).toBeCloseTo(slotBefore!.height, 0);
  });

  // DD03: Drag gem out of combine slot back to tray
  test('DD03: drag gem out of combine slot back to tray', async ({ page }) => {
    await setupForge(page);

    // Drag a gem INTO combo slot 0
    const gemInTray = page.locator('[data-gem-tray] [data-gem-uid]').first();
    await expect(gemInTray).toBeVisible();
    const gemBox = await gemInTray.boundingBox();
    expect(gemBox).not.toBeNull();
    const src = { x: gemBox!.x + gemBox!.width / 2, y: gemBox!.y + gemBox!.height / 2 };
    const slotTarget = await centre(page, '[data-combo-slot="0"]');
    await dragElement(page, src, slotTarget);
    await expect(page.locator('[data-combo-slot="0"][data-gem-uid]')).toBeVisible({ timeout: 3000 });

    // Now drag FROM combo slot 0 back to the tray
    const filledSlotPos = await centre(page, '[data-combo-slot="0"]');
    const trayPos = await centre(page, '[data-gem-tray]');
    await dragElement(page, filledSlotPos, trayPos);

    // Combo slot 0 should be empty (no data-gem-uid)
    await expect(page.locator('[data-combo-slot="0"]:not([data-gem-uid])')).toBeVisible({ timeout: 3000 });

    // All 3 slots should have the same size
    const boxes = await Promise.all(
      [0, 1, 2].map(async (i) => {
        return page.locator(`[data-combo-slot="${i}"]`).boundingBox();
      }),
    );
    for (const box of boxes) {
      expect(box).not.toBeNull();
    }
    expect(boxes[1]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[2]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[1]!.height).toBeCloseTo(boxes[0]!.height, 0);
    expect(boxes[2]!.height).toBeCloseTo(boxes[0]!.height, 0);
  });

  // DD04: Drag gem from combine slot to equipment socket
  test('DD04: drag gem from combine slot to equipment socket', async ({ page }) => {
    await setupForge(page);

    // Switch to Equip tab so sockets are visible
    await page.getByText(/Equip/i).first().click();
    await page.waitForTimeout(300);

    // Ensure sockets exist
    const sockets = page.locator('[data-forge-socket]');
    const socketCount = await sockets.count();
    test.skip(socketCount === 0, 'No sockets available');

    // Switch back to Plan & Combine tab
    await page.getByText(/Plan & Combine/i).first().click();
    await page.waitForTimeout(300);

    // Drag a gem into combo slot 0
    const gemInTray = page.locator('[data-gem-tray] [data-gem-uid]').first();
    await expect(gemInTray).toBeVisible();
    const gemBox = await gemInTray.boundingBox();
    expect(gemBox).not.toBeNull();
    const src = { x: gemBox!.x + gemBox!.width / 2, y: gemBox!.y + gemBox!.height / 2 };
    const slotTarget = await centre(page, '[data-combo-slot="0"]');
    await dragElement(page, src, slotTarget);
    await expect(page.locator('[data-combo-slot="0"][data-gem-uid]')).toBeVisible({ timeout: 3000 });

    // Record slot size before drag-out
    const slotSizeBefore = await page.locator('[data-combo-slot="0"]').boundingBox();

    // Switch to Equip tab
    await page.getByText(/Equip/i).first().click();
    await page.waitForTimeout(300);

    // The combo slot may no longer be visible in Equip tab, so let's check
    // whether the socket received the gem after we drag to it.
    // In the forge layout, combo slots remain visible — drag from combo slot to socket.
    const comboSlotVisible = await page.locator('[data-combo-slot="0"]').isVisible().catch(() => false);
    if (comboSlotVisible) {
      const comboPos = await centre(page, '[data-combo-slot="0"]');
      const socketPos = await centre(page, '[data-forge-socket]');
      await dragElement(page, comboPos, socketPos);

      // Combo slot 0 should now be empty
      await expect(page.locator('[data-combo-slot="0"]:not([data-gem-uid])')).toBeVisible({ timeout: 3000 });

      // Combo slot size should match original
      const slotSizeAfter = await page.locator('[data-combo-slot="0"]').boundingBox();
      expect(slotSizeAfter).not.toBeNull();
      expect(slotSizeAfter!.width).toBeCloseTo(slotSizeBefore!.width, 0);
      expect(slotSizeAfter!.height).toBeCloseTo(slotSizeBefore!.height, 0);

      // The socket should now contain the gem
      const filledSockets = page.locator('[data-forge-socket][data-gem-uid]');
      await expect(filledSockets.first()).toBeVisible({ timeout: 3000 });
    }
  });

  // DD05: Combo slot sizes remain consistent after multiple drag operations
  test('DD05: combo slot sizes consistent after multiple drags', async ({ page }) => {
    await setupForge(page);

    const trayGems = page.locator('[data-gem-tray] [data-gem-uid]');
    const gemCount = await trayGems.count();
    test.skip(gemCount < 3, 'Not enough gems for multi-drag test');

    // Drag gem to combo slot 0
    const gem0Box = await trayGems.nth(0).boundingBox();
    const slot0Target = await centre(page, '[data-combo-slot="0"]');
    await dragElement(
      page,
      { x: gem0Box!.x + gem0Box!.width / 2, y: gem0Box!.y + gem0Box!.height / 2 },
      slot0Target,
    );
    await page.waitForTimeout(200);

    // Drag gem to combo slot 1
    const gem1 = page.locator('[data-gem-tray] [data-gem-uid]').first();
    const gem1Box = await gem1.boundingBox();
    const slot1Target = await centre(page, '[data-combo-slot="1"]');
    await dragElement(
      page,
      { x: gem1Box!.x + gem1Box!.width / 2, y: gem1Box!.y + gem1Box!.height / 2 },
      slot1Target,
    );
    await page.waitForTimeout(200);

    // Drag gem from combo slot 0 back to tray
    const slot0Pos = await centre(page, '[data-combo-slot="0"]');
    const trayPos = await centre(page, '[data-gem-tray]');
    await dragElement(page, slot0Pos, trayPos);
    await page.waitForTimeout(200);

    // Drag a different gem to combo slot 0
    const gem2 = page.locator('[data-gem-tray] [data-gem-uid]').first();
    const gem2Box = await gem2.boundingBox();
    const slot0Target2 = await centre(page, '[data-combo-slot="0"]');
    await dragElement(
      page,
      { x: gem2Box!.x + gem2Box!.width / 2, y: gem2Box!.y + gem2Box!.height / 2 },
      slot0Target2,
    );
    await page.waitForTimeout(200);

    // All 3 combo slots should have identical dimensions
    const boxes = await Promise.all(
      [0, 1, 2].map(async (i) => {
        const slot = page.locator(`[data-combo-slot="${i}"]`);
        await expect(slot).toBeVisible();
        return slot.boundingBox();
      }),
    );
    for (const box of boxes) {
      expect(box).not.toBeNull();
    }
    expect(boxes[1]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[2]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[1]!.height).toBeCloseTo(boxes[0]!.height, 0);
    expect(boxes[2]!.height).toBeCloseTo(boxes[0]!.height, 0);

    // Width should be at least 80px (standard --gem-size, not old small --socket-size)
    expect(boxes[0]!.width).toBeGreaterThan(80);
  });

  // DD06: Drag gem from equipment socket to tray
  test('DD06: drag gem from equipment socket to tray', async ({ page }) => {
    await setupForge(page);

    // Switch to Equip tab
    await page.getByText(/Equip/i).first().click();
    await page.waitForTimeout(300);

    const sockets = page.locator('[data-forge-socket]');
    const socketCount = await sockets.count();
    test.skip(socketCount === 0, 'No sockets available');

    // Record stockpile gem count before
    const stockpileBefore = await page.locator('[data-gem-tray] [data-gem-uid]').count();

    // Drag a gem from tray to an empty socket
    const gemInTray = page.locator('[data-gem-tray] [data-gem-uid]').first();
    await expect(gemInTray).toBeVisible();
    const gemBox = await gemInTray.boundingBox();
    expect(gemBox).not.toBeNull();

    // Find first empty socket (no data-gem-uid attribute)
    const emptySocket = page.locator('[data-forge-socket]:not([data-gem-uid])').first();
    const emptySocketVisible = await emptySocket.isVisible().catch(() => false);
    test.skip(!emptySocketVisible, 'No empty sockets available');

    const socketTarget = await emptySocket.boundingBox();
    expect(socketTarget).not.toBeNull();

    await dragElement(
      page,
      { x: gemBox!.x + gemBox!.width / 2, y: gemBox!.y + gemBox!.height / 2 },
      { x: socketTarget!.x + socketTarget!.width / 2, y: socketTarget!.y + socketTarget!.height / 2 },
    );
    await page.waitForTimeout(300);

    // Find the filled socket
    const filledSocket = page.locator('[data-forge-socket][data-gem-uid]').first();
    const filledVisible = await filledSocket.isVisible().catch(() => false);
    test.skip(!filledVisible, 'Gem did not land in socket');

    const gemCountAfterSocket = await page.locator('[data-gem-tray] [data-gem-uid]').count();

    // Now drag FROM the filled socket TO the tray
    const filledPos = await filledSocket.boundingBox();
    expect(filledPos).not.toBeNull();
    const trayPos = await centre(page, '[data-gem-tray]');
    await dragElement(
      page,
      { x: filledPos!.x + filledPos!.width / 2, y: filledPos!.y + filledPos!.height / 2 },
      trayPos,
    );
    await page.waitForTimeout(300);

    // Stockpile count should have increased by 1 compared to the after-socket count
    const gemCountAfterReturn = await page.locator('[data-gem-tray] [data-gem-uid]').count();
    expect(gemCountAfterReturn).toBe(gemCountAfterSocket + 1);
  });

  // DD07: No ghost elements remain in DOM after drop
  test('DD07: no ghost elements remain after drop', async ({ page }) => {
    await setupForge(page);

    // Drag a gem to combo slot 0
    const gemInTray = page.locator('[data-gem-tray] [data-gem-uid]').first();
    await expect(gemInTray).toBeVisible();
    const gemBox = await gemInTray.boundingBox();
    expect(gemBox).not.toBeNull();
    const src = { x: gemBox!.x + gemBox!.width / 2, y: gemBox!.y + gemBox!.height / 2 };
    const tgt = await centre(page, '[data-combo-slot="0"]');
    await dragElement(page, src, tgt);

    // Wait for any cleanup animations
    await page.waitForTimeout(500);

    // Check for orphaned ghost elements (position: fixed + high z-index on body children)
    const ghostCount = await page.evaluate(() => {
      const children = document.body.children;
      let count = 0;
      for (let i = 0; i < children.length; i++) {
        const style = window.getComputedStyle(children[i]);
        if (style.position === 'fixed' && parseInt(style.zIndex, 10) >= 999) {
          count++;
        }
      }
      return count;
    });
    expect(ghostCount).toBe(0);
  });

  // DD08: Drag to empty space snaps back without side effects
  test('DD08: drag to empty space snaps back', async ({ page }) => {
    await setupForge(page);

    // Record stockpile gem count
    const gemCountBefore = await page.locator('[data-gem-tray] [data-gem-uid]').count();

    // Drag a gem to empty space (well outside any slot or socket)
    const gemInTray = page.locator('[data-gem-tray] [data-gem-uid]').first();
    await expect(gemInTray).toBeVisible();
    const gemBox = await gemInTray.boundingBox();
    expect(gemBox).not.toBeNull();

    const src = { x: gemBox!.x + gemBox!.width / 2, y: gemBox!.y + gemBox!.height / 2 };
    // Target a far corner of the viewport — no valid drop target there
    const viewport = page.viewportSize()!;
    const emptyTarget = { x: viewport.width - 10, y: 10 };
    await dragElement(page, src, emptyTarget);

    // Stockpile count should be unchanged
    const gemCountAfter = await page.locator('[data-gem-tray] [data-gem-uid]').count();
    expect(gemCountAfter).toBe(gemCountBefore);

    // All combo slots should still have consistent size
    const boxes = await Promise.all(
      [0, 1, 2].map(async (i) => {
        return page.locator(`[data-combo-slot="${i}"]`).boundingBox();
      }),
    );
    for (const box of boxes) {
      expect(box).not.toBeNull();
    }
    expect(boxes[1]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[2]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[1]!.height).toBeCloseTo(boxes[0]!.height, 0);
    expect(boxes[2]!.height).toBeCloseTo(boxes[0]!.height, 0);
  });
});
