import { test, expect } from '@playwright/test';
import { ARENA_READY, FLOOR_CLEAR, seedProfile } from './fixtures/delve';

// Room objects (see the room objects spec): a generated floor is furnished, and the minimap
// shows the cover and the hazards the hero has seen (its canvas's data-cover, data-hazards).
test.describe('Delve room objects', () => {
  test.describe.configure({ timeout: 240_000 });
  test('O01: a furnished floor shows its cover and hazards on the minimap as the bot explores', async ({
    page,
  }) => {
    // Seed 50's first floor stands six hazards: the hero sees cover from the start and a
    // hazard by about 8 s, at any frame rate. (A prop breaking isn't checked here: whether the
    // bot breaks one depends on the frame rate; the engine's tests cover it.)
    await seedProfile(page, 50);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    const minimap = page.getByTestId('minimap');
    const count = async (attr: string) => Number((await minimap.getAttribute(attr)) ?? 0);
    await expect.poll(() => count('data-cover'), { timeout: FLOOR_CLEAR }).toBeGreaterThan(0);
    await expect.poll(() => count('data-hazards'), { timeout: FLOOR_CLEAR }).toBeGreaterThan(0);
  });
});
