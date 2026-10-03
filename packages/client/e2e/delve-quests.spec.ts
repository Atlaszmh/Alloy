import { test, expect } from '@playwright/test';
import { ARENA_READY, seedProfile } from './fixtures/delve';

// Quests (see the quests spec): the main line's first quest done in a dive and claimed at the
// Anvil, and a contract rerolled once a visit.
test.describe('Delve quests', () => {
  test('Q01: First Steps done in a dive, claimed at the Anvil, and the next main quest opens', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    // A new save tracks First Steps: the HUD shows its progress at depth 1.
    const tracked = page.getByTestId('quest-tracker').getByTestId('tracked-first_steps');
    await expect(tracked).toContainText('First Steps');
    await expect(tracked).toContainText('Reach depth 2');
    await expect(tracked).toContainText('1 / 2');

    // A door down enters depth 2 (First Steps done the moment it happens, with its toast), then
    // abandon: progress counts, death or not.
    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: 60_000 });
    // The toast lasts 2 s: watch for it from before the click, so a slow run can't miss it.
    const toast = page
      .getByText('Quest complete: First Steps · claim at the Anvil')
      .waitFor({ timeout: 15_000 });
    await door.getByTestId('door-list').locator('[data-door]').first().click();
    await toast;
    await expect(door).toBeHidden();
    await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');
    await expect(tracked.getByRole('img', { name: 'Done' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('dive-pause').getByTestId('pause-abandon').click();
    await expect(page.getByTestId('dive-summary')).toContainText('ABANDONED');
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();

    // The Anvil: the tab's pip and the footer's count (a contract may be done too); the count
    // opens Quests.
    await expect(page.getByTestId('claim-pip')).toHaveText(/^[1-9][0-9]*$/);
    await page.getByTestId('claim-count').click();
    await expect(page.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
    const first = page.getByTestId('quest-journal').getByTestId('quest-first_steps');
    await expect(first.getByTestId('quest-done')).toHaveText('DONE');
    await first.click();
    await page.getByTestId('quest-claim').click();
    await expect(page.getByTestId('quest-message')).toContainText('Claimed First Steps');

    // Claimed: First Steps moves to Done (open, since it is the open quest), and the next main
    // quest arrives NEW.
    await expect(page.getByTestId('quest-group-done')).toContainText('First Steps');
    const next = page.getByTestId('quest-group-main').getByTestId('quest-bring_it_home');
    await expect(next.getByTestId('quest-new')).toBeVisible();
  });

  test('Q02: a contract rerolls once a visit, for its price', async ({ page }) => {
    await seedProfile(page, 4242, false, undefined, { scrap: 500 });
    await page.goto('/delve');
    await page.getByTestId('tab-quests').click();
    // A new save's board is full.
    const slot = page.getByTestId('contract-slot-0').getByRole('button');
    const before = await slot.getAttribute('data-testid');
    await slot.click();
    const reroll = page.getByTestId('quest-reroll');
    await expect(reroll).toBeEnabled();
    await expect(reroll).toContainText(/\d+ scrap/);
    await reroll.click();
    // The slot holds a new contract (open now), the scrap is spent, and the visit's reroll with it.
    await expect(slot).not.toHaveAttribute('data-testid', before!);
    await expect(slot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('scrap-count')).not.toHaveText('500 scrap');
    await expect(reroll).toBeDisabled();
    await expect(page.getByTestId('quest-reroll-why')).toHaveText(
      'One reroll a visit: clear a depth to reroll again',
    );
  });
});
